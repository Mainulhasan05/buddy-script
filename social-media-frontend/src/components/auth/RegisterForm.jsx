'use client';

import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/src/api/auth.api';
import { clearSessionExpired } from '@/src/api/axiosInstance';
import { setCredentials } from '@/src/store/slices/authSlice';
import Button from '@/src/components/ui/Button';
import { getErrorMessage, normalizeApiError } from '@/src/utils/apiError';
import FormFieldError from '@/src/components/ui/FormFieldError';

export default function RegisterForm() {
  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const redirectTo = searchParams.get('redirectTo') || '/feed';
  const startGoogleLogin = () => {
    try {
      window.location.href = authApi.getGoogleLoginUrl(redirectTo);
    } catch {
      setError('Google login is not configured for this environment.');
    }
  };

  const validateField = (name, value, allValues) => {
    if (name === 'firstName') {
      if (!value.trim()) return 'First name is required';
      if (value.trim().length < 2) return 'First name must be at least 2 characters';
      if (value.trim().length > 50) return 'First name must not exceed 50 characters';
    }
    if (name === 'lastName') {
      if (!value.trim()) return 'Last name is required';
      if (value.trim().length < 2) return 'Last name must be at least 2 characters';
      if (value.trim().length > 50) return 'Last name must not exceed 50 characters';
    }
    if (name === 'email') {
      if (!value) return 'Email is required';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return 'Please enter a valid email address';
    }
    if (name === 'password') {
      if (!value) return 'Password is required';
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
    }
    if (name === 'confirmPassword') {
      if (!value) return 'Please repeat your password';
      if (value !== allValues.password) return 'Passwords do not match';
    }
    if (name === 'terms') {
      if (!value) return 'You must agree to the terms & conditions';
    }
    return '';
  };

  const handleBlur = (e) => {
    const { name, value, checked, type } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const errorMsg = validateField(name, val, form);
    setErrors((prev) => ({ ...prev, [name]: errorMsg }));
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setForm((prev) => ({ ...prev, [name]: val }));
    if (error) setError('');

    if (touched[name] || errors[name]) {
      const errorMsg = validateField(name, val, { ...form, [name]: val });
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
      const errorMsg = validateField(key, form[key], form);
      if (errorMsg) {
        newErrors[key] = errorMsg;
      }
    });

    setErrors(newErrors);
    setTouched(newTouched);

    if (Object.keys(newErrors).length > 0) {
      setError('Please resolve validation errors before registering.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await authApi.register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        password: form.password,
      });
      clearSessionExpired(); // fresh session — re-arm silent refresh
      document.cookie = 'isLoggedIn=true; path=/; max-age=604800; SameSite=Lax';
      dispatch(setCredentials({ user: data.data.user, accessToken: data.data.accessToken }));
      router.push(redirectTo.startsWith('/') ? redirectTo : '/feed');
    } catch (err) {
      const normalized = normalizeApiError(err);
      if (normalized.fieldErrors && Object.keys(normalized.fieldErrors).length > 0) {
        setErrors(normalized.fieldErrors);
      }
      setError(normalized.message || "We couldn't create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="_social_registration_wrapper _layout_main_wrapper">
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

      <div className="_social_registration_wrap">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
              <div className="_social_registration_right">
                <div className="_social_registration_right_image">
                  <img src="/assets/images/registration.png" alt="" />
                </div>
                <div className="_social_registration_right_image_dark">
                  <img src="/assets/images/registration1.png" alt="" />
                </div>
              </div>
            </div>

            <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
              <div className="_social_registration_content">
                <div className="_social_registration_right_logo _mar_b28">
                  <img src="/assets/images/logo.svg" alt="Buddy Script" className="_right_logo" />
                </div>

                <p className="_social_registration_content_para _mar_b8">Get Started Now</p>
                <h4 className="_social_registration_content_title _titl4 _mar_b50">Registration</h4>

                <button
                  type="button"
                  className="_social_registration_content_btn _mar_b40"
                  onClick={startGoogleLogin}
                >
                  <img src="/assets/images/google.svg" alt="Image" className="_google_img" /> <span>Register with google</span>
                </button>
                <div className="_social_registration_content_bottom_txt _mar_b40"> <span>Or</span>
                </div>

                {error && (
                  <div className="alert alert-danger" role="alert" style={{ marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <form className="_social_registration_form" onSubmit={handleSubmit}>
                  <div className="row">
                    <div className="col-xl-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">First Name</label>
                        <input
                          type="text"
                          name="firstName"
                          value={form.firstName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={`form-control _social_registration_input ${errors.firstName ? 'is-invalid' : ''}`}
                          minLength={2}
                          maxLength={50}
                        />
                        <FormFieldError error={errors.firstName} />
                      </div>
                    </div>
                    <div className="col-xl-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">Last Name</label>
                        <input
                          type="text"
                          name="lastName"
                          value={form.lastName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={`form-control _social_registration_input ${errors.lastName ? 'is-invalid' : ''}`}
                          minLength={2}
                          maxLength={50}
                        />
                        <FormFieldError error={errors.lastName} />
                      </div>
                    </div>
                    <div className="col-xl-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={`form-control _social_registration_input ${errors.email ? 'is-invalid' : ''}`}
                          autoComplete="email"
                        />
                        <FormFieldError error={errors.email} />
                      </div>
                    </div>
                    <div className="col-xl-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">Password</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={form.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`form-control _social_registration_input ${errors.password ? 'is-invalid' : ''}`}
                            autoComplete="new-password"
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
                    <div className="col-xl-12">
                      <div className="_social_registration_form_input _mar_b14">
                        <label className="_social_registration_label _mar_b8">Repeat Password</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="confirmPassword"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`form-control _social_registration_input ${errors.confirmPassword ? 'is-invalid' : ''}`}
                            autoComplete="new-password"
                            style={{ paddingRight: 74 }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((value) => !value)}
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
                            {showConfirmPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <FormFieldError error={errors.confirmPassword} />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-lg-12 col-xl-12 col-md-12 col-sm-12">
                      <div className="form-check _social_registration_form_check" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            className="form-check-input _social_registration_form_check_input"
                            type="checkbox"
                            name="terms"
                            id="terms"
                            checked={form.terms}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            style={{ marginTop: 0 }}
                          />
                          <label className="form-check-label _social_registration_form_check_label" htmlFor="terms">
                            I agree to terms & conditions
                          </label>
                        </div>
                        <FormFieldError error={errors.terms} />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-lg-12">
                      <div className="_social_registration_form_btn _mar_t40 _mar_b60">
                        <Button
                          type="submit"
                          className="_social_registration_form_btn_link _btn1"
                          loading={loading}
                          loadingLabel="Creating account..."
                          style={{ width: '100%', padding: '13px 20px' }}
                        >
                          Register now
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="row">
                  <div className="col-xl-12">
                    <div className="_social_registration_bottom_txt">
                      <p className="_social_registration_bottom_txt_para">
                        Already have an account?{' '}
                        <Link href="/login">Login</Link>
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
