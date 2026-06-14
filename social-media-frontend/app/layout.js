import './globals.css';
import { Poppins } from 'next/font/google';
import ReduxProvider from '@/src/components/layout/ReduxProvider';
import Toast from '@/src/components/ui/Toast';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata = {
  title: 'Buddy Script',
  description: 'Social media platform for students in Bangladesh',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={poppins.variable}>
      <head>
        {/* Template CSS files — order matters */}
        <link rel="stylesheet" href="/assets/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/assets/css/common.css" />
        <link rel="stylesheet" href="/assets/css/main.css" />
        <link rel="stylesheet" href="/assets/css/responsive.css" />
      </head>
      <body className={poppins.className}>
        <ReduxProvider>
          {children}
          <Toast />
        </ReduxProvider>
      </body>
    </html>
  );
}
