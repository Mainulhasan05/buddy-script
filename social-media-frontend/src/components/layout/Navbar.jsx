'use client';

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/src/store/slices/authSlice';
import { resetFeed } from '@/src/store/slices/feedSlice';
import { authApi } from '@/src/api/auth.api';
import Button from '@/src/components/ui/Button';

export default function Navbar() {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((s) => s.auth.user);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setDropdownOpen(false);
    try {
      await authApi.logout();
    } catch {
      // Logout remains a local success even if the best-effort server cleanup fails.
    } finally {
      dispatch(logout());
      dispatch(resetFeed());
      setLoggingOut(false);
      router.push('/login');
    }
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-light _header_nav _padd_t10">
      <div className="container _custom_container">
        {/* Logo */}
        <div className="_logo_wrap">
          <Link className="navbar-brand" href="/feed">
            <img src="/assets/images/logo.svg" alt="Buddy Script" className="_nav_logo" />
          </Link>
        </div>

        {/* Navbar collapse */}
        <div className="collapse navbar-collapse" id="navbarSupportedContent">
          {/* Search */}
          <div className="_header_form ms-auto">
            <form className="_header_form_grp">
              <svg className="_header_form_svg" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 17 17">
                <circle cx="7" cy="7" r="6" stroke="#666" />
                <path stroke="#666" strokeLinecap="round" d="M16 16l-3-3" />
              </svg>
              <input className="form-control me-2 _inpt1" type="search" placeholder="Search..." aria-label="Search" />
            </form>
          </div>

          {/* Nav icons */}
          <ul className="navbar-nav mb-2 mb-lg-0 _header_nav_list ms-auto _mar_r8">
            <li className="nav-item _header_nav_item">
              <Link className="nav-link _header_nav_link_active _header_nav_link" href="/feed">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="21" fill="none" viewBox="0 0 18 21">
                  <path className="_home_active" stroke="#000" strokeWidth="1.5" strokeOpacity=".6" d="M1 9.924c0-1.552 0-2.328.314-3.01.313-.682.902-1.187 2.08-2.196l1.143-.98C6.667 1.913 7.732 1 9 1c1.268 0 2.333.913 4.463 2.738l1.142.98c1.179 1.01 1.768 1.514 2.081 2.196.314.682.314 1.458.314 3.01v4.846c0 2.155 0 3.233-.67 3.902-.669.67-1.746.67-3.901.67H5.57c-2.155 0-3.232 0-3.902-.67C1 18.002 1 16.925 1 14.77V9.924z" />
                </svg>
              </Link>
            </li>
          </ul>

          {/* Profile dropdown */}
          <div
            className="_header_nav_profile"
            onClick={() => setDropdownOpen((v) => !v)}
            style={{ cursor: 'pointer' }}
          >
            <div className="_header_nav_profile_image">
              <img
                src={user?.avatar?.url || '/assets/images/profile.png'}
                alt={user?.firstName}
                className="_nav_profile_img"
              />
            </div>
            <div className="_header_nav_dropdown">
              <p className="_header_nav_para">{user?.firstName} {user?.lastName}</p>
              <button
                type="button"
                className="_header_nav_dropdown_btn _dropdown_toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen((v) => !v);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" fill="none" viewBox="0 0 10 6">
                  <path fill="#112032" d="M5 5l.354.354L5 5.707l-.354-.353L5 5zm4.354-3.646l-4 4-.708-.708 4-4 .708.708zm-4.708 4l-4-4 .708-.708 4 4-.708.708z" />
                </svg>
              </button>
            </div>

            {dropdownOpen && (
              <div
                className="_nav_profile_dropdown _profile_dropdown"
                style={{ display: 'block' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="_nav_profile_dropdown_info">
                  <div className="_nav_profile_dropdown_image">
                    <img
                      src={user?.avatar?.url || '/assets/images/profile.png'}
                      alt=""
                      className="_nav_drop_img"
                    />
                  </div>
                  <div className="_nav_profile_dropdown_info_txt">
                    <h4 className="_nav_dropdown_title">{user?.firstName} {user?.lastName}</h4>
                    <span className="_nav_drop_profile" style={{ fontSize: 13, color: '#666' }}>
                      {user?.email}
                    </span>
                  </div>
                </div>
                <hr />
                <ul className="_nav_dropdown_list">
                  <li className="_nav_dropdown_list_item">
                    <Button
                      type="button"
                      className="_nav_dropdown_link"
                      onClick={handleLogout}
                      variant="ghost"
                      loading={loggingOut}
                      loadingLabel="Logging out..."
                      style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', minWidth: 0, padding: 0 }}
                    >
                      <div className="_nav_drop_info">
                        <span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" fill="none" viewBox="0 0 19 19">
                            <path stroke="#377DFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6.667 18H2.889A1.889 1.889 0 011 16.111V2.89A1.889 1.889 0 012.889 1h3.778M13.277 14.222L18 9.5l-4.723-4.722M18 9.5H6.667" />
                          </svg>
                        </span>
                        Log Out
                      </div>
                    </Button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
