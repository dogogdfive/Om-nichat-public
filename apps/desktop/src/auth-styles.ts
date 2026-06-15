/** Injected in the desktop app only — login/signup controls ~30% larger than web. */
export const DESKTOP_AUTH_CSS = `
  html[data-omnichat-app="desktop"] .prochat-auth-oauth {
    padding: 1.3rem 1.625rem !important;
    font-size: 1.46rem !important;
    min-height: 4.23rem !important;
  }
  html[data-omnichat-app="desktop"] .prochat-auth-oauth svg,
  html[data-omnichat-app="desktop"] .prochat-auth-oauth img {
    width: 1.95rem !important;
    height: 1.95rem !important;
  }
  html[data-omnichat-app="desktop"] .prochat-auth-submit {
    padding: 1.3rem 1.625rem !important;
    font-size: 1.46rem !important;
    min-height: 4.23rem !important;
  }
  html[data-omnichat-app="desktop"] .landing-hero-backing-actions a {
    padding: 1.14rem 2.28rem !important;
    font-size: 1.38rem !important;
    min-height: 3.9rem !important;
  }
`;
