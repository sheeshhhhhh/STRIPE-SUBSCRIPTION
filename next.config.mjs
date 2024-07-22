/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                hostname: 'h3.googleusercontent.com'
            }
        ]
    }
};

export default nextConfig;
