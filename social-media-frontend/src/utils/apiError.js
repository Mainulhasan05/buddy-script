'use client';

const DEFAULT_MESSAGES = {
  network: "We couldn't connect. Check your internet and try again.",
  validation: 'Please check the highlighted fields.',
  auth: 'Your session has expired. Please log in again.',
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find that. It may have been deleted.",
  server: "We're having trouble right now. Please try again.",
  rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  unknown: "We couldn't complete that action. Please try again.",
};

const CODE_MESSAGES = {
  INVALID_CREDENTIALS: "That email or password doesn't look right.",
  EMAIL_TAKEN: 'That email is already registered. Try logging in instead.',
  AUTH_TOKEN_EXPIRED: DEFAULT_MESSAGES.auth,
  AUTH_TOKEN_INVALID: DEFAULT_MESSAGES.auth,
  AUTH_TOKEN_MISSING: DEFAULT_MESSAGES.auth,
  AUTH_TOKEN_REUSED: DEFAULT_MESSAGES.auth,
  FORBIDDEN: DEFAULT_MESSAGES.forbidden,
  POST_NOT_FOUND: "We couldn't find that post. It may have been deleted.",
  COMMENT_NOT_FOUND: "We couldn't find that comment. It may have been deleted.",
  FILE_TOO_LARGE: 'That image is too large. Choose an image under 5 MB.',
  UNSUPPORTED_MEDIA_TYPE: 'Use a JPEG, PNG, or WebP image.',
  RATE_LIMITED: DEFAULT_MESSAGES.rate_limit,
};

const STATUS_TYPES = {
  400: 'validation',
  401: 'auth',
  403: 'forbidden',
  404: 'not_found',
  409: 'validation',
  413: 'validation',
  415: 'validation',
  422: 'validation',
  429: 'rate_limit',
};

export function normalizeApiError(error, fallbackMessage) {
  if (error?.normalized) return error;

  if (!error?.response) {
    return {
      normalized: true,
      type: 'network',
      message: fallbackMessage || DEFAULT_MESSAGES.network,
      fieldErrors: {},
      status: null,
      code: 'NETWORK_ERROR',
      retryAfter: null,
    };
  }

  const { status, data, headers } = error.response;
  const code = data?.code || 'UNKNOWN_ERROR';
  const type = STATUS_TYPES[status] || (status >= 500 ? 'server' : 'unknown');
  const fieldErrors = {};

  if (Array.isArray(data?.errors)) {
    data.errors.forEach((item) => {
      if (item?.field) fieldErrors[item.field] = item.message;
    });
  }

  return {
    normalized: true,
    type,
    message: fallbackMessage || CODE_MESSAGES[code] || DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.unknown,
    fieldErrors,
    status,
    code,
    retryAfter: headers?.['retry-after'] || null,
  };
}

export function getErrorMessage(error, fallbackMessage) {
  return normalizeApiError(error, fallbackMessage).message;
}
