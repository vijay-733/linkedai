const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const {
  LINKEDIN_CLIENT_ID:     CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI:  REDIRECT_URI = 'http://localhost:3001/auth/linkedin/callback',
  FRONTEND_URL = 'http://localhost:5173',
} = process.env;

// ── Initiate LinkedIn OAuth ───────────────────────────────────────────────────
router.get('/linkedin', (req, res) => {
  if (!CLIENT_ID) {
    return res.redirect(`${FRONTEND_URL}?auth_error=no_linkedin_credentials`);
  }
  const state = `state_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  req.session.oauthState = state;

  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);

  res.redirect(url.toString());
});

// ── OAuth callback ────────────────────────────────────────────────────────────
router.get('/linkedin/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) return res.redirect(`${FRONTEND_URL}?auth_error=${error}`);
  if (state !== req.session.oauthState) {
    return res.redirect(`${FRONTEND_URL}?auth_error=state_mismatch`);
  }

  try {
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;

    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const p = profileRes.data;
    req.session.user = {
      id:               p.sub,
      name:             p.name,
      firstName:        p.given_name,
      lastName:         p.family_name,
      email:            p.email,
      picture:          p.picture,
      linkedinConnected: true,
      _accessToken:     accessToken,
    };

    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('LinkedIn OAuth error:', err.response?.data || err.message);
    res.redirect(`${FRONTEND_URL}?auth_error=oauth_failed`);
  }
});

// ── Current session user ──────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const { _accessToken, ...safe } = req.session.user;
  res.json({ user: safe });
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Manual setup (no OAuth needed) ───────────────────────────────────────────
router.post('/manual-setup', (req, res) => {
  const { name, headline, profileUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  req.session.user = {
    name,
    headline:          headline || '',
    profileUrl:        profileUrl || '',
    linkedinConnected: false,
    manualSetup:       true,
  };
  const { _accessToken, ...safe } = req.session.user;
  res.json({ success: true, user: safe });
});

// ── Update session profile data (after AI analysis) ──────────────────────────
router.post('/update-profile', (req, res) => {
  if (!req.session.user) req.session.user = {};
  req.session.user = { ...req.session.user, ...req.body };
  res.json({ success: true });
});

module.exports = router;
