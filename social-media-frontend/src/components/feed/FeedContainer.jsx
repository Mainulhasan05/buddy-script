'use client';

import { useDispatch, useSelector } from 'react-redux';
import { openCreatePostModal } from '@/src/store/slices/uiSlice';
import { useFeed } from '@/src/hooks/useFeed';
import PostCard from './PostCard';
import PostSkeleton from './PostSkeleton';
import InfiniteScrollTrigger from './InfiniteScrollTrigger';
import CreatePostModal from './CreatePostModal';
import LikeList from '@/src/components/post/LikeList';
import EmptyState from '@/src/components/ui/EmptyState';
import RetryState from '@/src/components/ui/RetryState';
import InlineSpinner from '@/src/components/ui/InlineSpinner';

export default function FeedContainer() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const createModalOpen = useSelector((s) => s.ui.createPostModal);

  const { posts, hasMore, loading, loadingMore, error, loadMore, retry } = useFeed();

  return (
    <>
      {/* Create post trigger */}
      <div className="_feed_inner_text_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16">
        <div className="_feed_inner_text_area_box">
          <div className="_feed_inner_text_area_box_image">
            <img
              src={user?.avatar?.url || '/assets/images/txt_img.png'}
              alt=""
              className="_txt_img"
            />
          </div>
          <div className="form-floating _feed_inner_text_area_box_form">
            <textarea
              className="form-control _textarea"
              placeholder="Write something..."
              readOnly
              onClick={() => dispatch(openCreatePostModal())}
              style={{ cursor: 'pointer' }}
            />
            <label className="_feed_textarea_label" htmlFor="create-post-trigger">
              Write something...
            </label>
          </div>
        </div>
        <div className="_feed_inner_text_area_bottom">
          <div className="_feed_inner_text_area_item">
            <div className="_feed_inner_text_area_bottom_photo _feed_common">
              <button
                type="button"
                className="_feed_inner_text_area_bottom_photo_link"
                onClick={() => dispatch(openCreatePostModal())}
              >
                <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 20 20">
                    <path fill="#666" d="M13.916 0c3.109 0 5.18 2.429 5.18 5.914v8.17c0 3.486-2.072 5.916-5.18 5.916H5.999C2.89 20 .827 17.572.827 14.085v-8.17C.827 2.43 2.897 0 6 0h7.917z"/>
                  </svg>
                </span>
                Photo
              </button>
            </div>
          </div>
          <div className="_feed_inner_text_area_btn">
            <button
              type="button"
              className="_feed_inner_text_area_btn_link"
              onClick={() => dispatch(openCreatePostModal())}
            >
              <svg className="_mar_img" xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" viewBox="0 0 14 13">
                <path fill="#fff" fillRule="evenodd" d="M6.37 7.879l2.438 3.955a.335.335 0 00.34.162c.068-.01.23-.05.289-.247l3.049-10.297a.348.348 0 00-.09-.35.341.341 0 00-.34-.088L1.75 4.03a.34.34 0 00-.247.289.343.343 0 00.16.347L5.666 7.17 9.2 3.597a.5.5 0 01.712.703L6.37 7.88z" clipRule="evenodd" />
              </svg>
              <span>Post</span>
            </button>
          </div>
        </div>
      </div>

      {/* Skeletons while initial load */}
      {loading && posts.length === 0 && (
        <>
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </>
      )}

      {!loading && error && posts.length === 0 && (
        <RetryState message={error} onRetry={retry} retrying={loading} />
      )}

      {!loading && !error && posts.length === 0 && (
        <EmptyState
          heading="No posts yet"
          subtext="Be the first to share something with your community."
          actionLabel="Create a post"
          onAction={() => dispatch(openCreatePostModal())}
        />
      )}

      {/* Feed posts */}
      {posts.map((post) => (
        <PostCard key={post._id} post={post} />
      ))}

      {/* Loading indicator for infinite scroll */}
      {loadingMore && posts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 18, color: '#64748b' }}>
          <InlineSpinner />
          <span>Loading more posts...</span>
        </div>
      )}

      {!loadingMore && error && posts.length > 0 && (
        <RetryState message={error} onRetry={loadMore} retrying={loadingMore} />
      )}

      {/* Trigger for loading more */}
      <InfiniteScrollTrigger onVisible={loadMore} hasMore={hasMore} loading={loading || loadingMore} />

      {/* Modals */}
      {createModalOpen && <CreatePostModal />}
      <LikeList />
    </>
  );
}
