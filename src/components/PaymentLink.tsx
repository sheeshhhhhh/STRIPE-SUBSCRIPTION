"use client"

import Link from 'next/link'
import { buttonVariants } from './ui/button'

type PaymentLinkProps = {
    href: string,
    paymentLink?: string,
    text: string
}

const PaymentLink = ({
    href,
    paymentLink,
    text
} : PaymentLinkProps ) => {

  return (
    <Link 
    href={href}
    onClick={() => {
        if(paymentLink) {
            localStorage.setItem('stripePaymentLink', paymentLink)
        }
    }}
    className={buttonVariants()}
    >
        {text}
    </Link>
  )
}

export default PaymentLink