import prisma from '@/db/prisma'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

export async function POST(req: Request) {
    const body = await req.text()

    const sig = req.headers.get('stripe-signature')!
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
    } catch (error: any) {
        console.log("Webhook signature verification failed.", error.message)
        return new Response(`Webhook Error: ${error.message}`, { status: 400 })
    }

    // processing the payment
    try {
        switch(event.type) {
            case 'checkout.session.completed':
                const session = await stripe.checkout.sessions.retrieve(
                    (event.data.object as Stripe.Checkout.Session).id,{
                        expand: ["line_items"]
                    }
                )

                const customerId = session.customer as string
                const customerDetails = session.customer_details 
                
                if(customerDetails?.email) {
                    const user = await prisma.user.findUnique({
                        where: {
                            email: customerDetails.email
                        }
                    })

                    if(!user) throw new Error('User not found')
                    
                    if(!user.customerId) {
                        // first time subscription
                        await prisma.user.update({
                            where: {
                                id: user.id
                            },
                            data: {
                                customerId
                            }
                        })
                    }

                    const line_items = session.line_items?.data || []

                    for (const item of line_items) {
                        const priceId = item.price?.id
                        const isSubscription = item.price?.type === 'recurring'
                        const period = priceId === process.env.STRIPE_MONTHLY_PRICE_ID ? 'monthly' : 'yearly'

                        if(isSubscription) {
                            let endDate = new Date()

                            if(priceId === process.env.STRIPE_MONTHLY_PRICE_ID!) {
                                endDate.setMonth(endDate.getMonth() + 1) // 1 month from now is the end Date
                            } else if(priceId === process.env.STRIPE_YEARLY_PRICE_ID) {
                                endDate.setFullYear(endDate.getFullYear() + 1) // 1 full year from now is the end Date
                            } else { 
                                throw new Error('Invalid Price Id')
                            }

                            // it is gonna create the subscription if it does not exist already, but update it if it does
                            await prisma.subscription.upsert({
                                where: {
                                    userId: user.id
                                }, 
                                create: {
                                    userId: user.id,
                                    StartDate: new Date(),
                                    endDate: endDate,
                                    plan: "premium",
                                    period: period,
                                },
                                update: {
                                    StartDate: new Date(),
                                    endDate: endDate,
                                    plan: "premium",
                                    period: period,
                                }
                            })
                        }
                    }

                    await prisma.user.update({
                        where: {
                            id: user.id
                        }, 
                        data: {
                            plan: 'premium'
                        }
                    })
                }

                break;
            case "customer.subscription.deleted": {
                const subscription = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id)
                const user = await prisma.user.findUnique({
                    where: {
                        customerId: subscription.customer as string
                    }
                })
                
                if(user) {
                    await prisma.user.update({
                        where:{ id : user.id},
                        data: {
                            plan: 'free'
                        }
                    })
                } else {
                    console.log("User not found for the subscription deleted event.")
                    throw new Error("User not found for the subscription deleted event.")
                }

                break
            }
                
            
            default:
                console.log('Unhandled event type' + event.type)
        }
        
    } catch (error: any) {
        console.log(`Error in proccessing the payment. Error: ${error.message}`)
        return new Response(`Webhook Error: ${error.message}`, { status: 400})
    }

    return new Response("Payment Received!", { status: 200 })
}