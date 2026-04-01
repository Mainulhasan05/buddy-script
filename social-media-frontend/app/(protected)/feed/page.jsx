'use client';

import Navbar from '@/src/components/layout/Navbar';
import FeedContainer from '@/src/components/feed/FeedContainer';

export default function FeedPage() {
  return (
    <div className="_layout">
      <Navbar />
      <main className="_main_layout">
        <div className="container _custom_container">
          <div className="row">
            <div className="col-lg-8 offset-lg-2">
              <FeedContainer />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
