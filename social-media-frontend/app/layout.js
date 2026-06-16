// Template stylesheets — imported through the Next.js CSS pipeline so they are
// minified, content-hashed, bundled, and served with immutable long-cache headers
// instead of four render-blocking <link> tags. Order matters: base/vendor first,
// then globals.css last so its overrides win.
import '@/styles/vendor/bootstrap.min.css';
import '@/styles/vendor/common.css';
import '@/styles/vendor/main.css';
import '@/styles/vendor/responsive.css';
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
      <body className={poppins.className}>
        <ReduxProvider>
          {children}
          <Toast />
        </ReduxProvider>
      </body>
    </html>
  );
}
