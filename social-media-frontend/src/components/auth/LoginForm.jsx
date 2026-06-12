'use client';

import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/src/api/auth.api';
import { setCredentials } from '@/src/store/slices/authSlice';
import { showToast } from '@/src/store/slices/uiSlice';
import Button from '@/src/components/ui/Button';
import { getErrorMessage } from '@/src/utils/apiError';
import FormFieldError from '@/src/components/ui/FormFieldError';

export default function LoginForm() {
  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const sessionExpired = searchParams.get('reason') === 'session-expired';
  const redirectTo = searchParams.get('redirectTo') || '/feed';

  const validateField = (name, value) => {
    if (name === 'email') {
      if (!value) return 'Email is required';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return 'Please enter a valid email address';
    }
    if (name === 'password') {
      if (!value) return 'Password is required';
    }
    return '';
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const errorMsg = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: errorMsg }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');

    if (touched[name] || errors[name]) {
      const errorMsg = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: errorMsg }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all fields
    const newErrors = {};
    const newTouched = {};
    Object.keys(form).forEach((key) => {
      newTouched[key] = true;
      const errorMsg = validateField(key, form[key]);
      if (errorMsg) {
        newErrors[key] = errorMsg;
      }
    });

    setErrors(newErrors);
    setTouched(newTouched);

    if (Object.keys(newErrors).length > 0) {
      setError('Please resolve validation errors before logging in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await authApi.login(form);
      dispatch(setCredentials({ user: data.data.user, accessToken: data.data.accessToken }));
      router.push(redirectTo.startsWith('/') ? redirectTo : '/feed');
    } catch (err) {
      setError(getErrorMessage(err, "That email or password doesn't look right."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="_social_login_wrapper _layout_main_wrapper">
      <div className="_shape_one">
        <img src="/assets/images/shape1.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape.svg" alt="" className="_dark_shape" />
      </div>
      <div className="_shape_two">
        <img src="/assets/images/shape2.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape1.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className="_shape_three">
        <img src="/assets/images/shape3.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape2.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>

      <div className="_social_login_wrap">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
              <div className="_social_login_left">
                <div className="_social_login_left_image">
                  <img src="/assets/images/login.png" alt="" className="_left_img" />
                </div>
              </div>
            </div>

            <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
              <div className="_social_login_content">
                <div className="_social_login_left_logo _mar_b28">
                  <img src="/assets/images/logo.svg" alt="Buddy Script" className="_left_logo" />
                </div>

                <p className="_social_login_content_para _mar_b8">Welcome back</p>
                <h4 className="_social_login_content_title _titl4 _mar_b50">Login to your account</h4>

                <button
                  type="button"
                  className="_social_login_content_btn _mar_b40"
                  onClick={() => dispatch(showToast({ message: 'Google Sign-In is not supported in this version. Please log in with your email.', type: 'info' }))}
                >
                  <img src="/assets/images/google.svg" alt="Image" className="_google_img" /> <span>Or sign-in with google</span>
                </button>
                <div className="_social_login_content_bottom_txt _mar_b40"> <span>Or</span>
                </div>

                {sessionExpired && !error && (
                  <div className="alert alert-info" role="status" style={{ marginBottom: '16px' }}>
                    Your session has expired. Please log in again.
                  </div>
                )}

                {error && (
                  <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <form className="_social_login_form" onSubmit={handleSubmit}>
                  <div className="row">
                    <div className="col-xl-12">
                      <div className="_social_login_form_input _mar_b14">
                        <label className="_social_login_label _mar_b8">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={`form-control _social_login_input ${errors.email ? 'is-invalid' : ''}`}
                          autoComplete="email"
                        />
                        <FormFieldError error={errors.email} />
                      </div>
                    </div>
                    <div className="col-xl-12">
                      <div className="_social_login_form_input _mar_b14">
                        <label className="_social_login_label _mar_b8">Password</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={form.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`form-control _social_login_input ${errors.password ? 'is-invalid' : ''}`}
                            autoComplete="current-password"
                            style={{ paddingRight: 74 }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            style={{
                              position: 'absolute',
                              right: 12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              border: 'none',
                              background: 'transparent',
                              color: '#377DFF',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <FormFieldError error={errors.password} />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
                      <div className="form-check _social_login_form_check">
                        <input
                          className="form-check-input _social_login_form_check_input"
                          type="radio"
                          name="flexRadioDefault"
                          id="flexRadioDefault2"
                          defaultChecked
                        />
                        <label className="form-check-label _social_login_form_check_label" htmlFor="flexRadioDefault2">
                          Remember me
                        </label>
                      </div>
                    </div>
                    <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
                      <div className="_social_login_form_left">
                        <p
                          className="_social_login_form_left_para"
                          style={{ cursor: 'pointer' }}
                          onClick={() => dispatch(showToast({ message: 'Password recovery is not supported in this version. Please use your registered credentials.', type: 'info' }))}
                        >
                          Forgot password?
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-lg-12">
                      <div className="_social_login_form_btn _mar_t40 _mar_b60">
                        <Button
                          type="submit"
                          className="_social_login_form_btn_link _btn1"
                          loading={loading}
                          loadingLabel="Logging in..."
                          style={{ width: '100%', padding: '13px 20px' }}
                        >
                          Login now
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="row">
                  <div className="col-xl-12">
                    <div className="_social_login_bottom_txt">
                      <p className="_social_login_bottom_txt_para">
                        Don&apos;t have an account?{' '}
                        <Link href="/register">Create New Account</Link>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
