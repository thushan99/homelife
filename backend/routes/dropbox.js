const express = require('express');
const router = express.Router();
const { Dropbox } = require('dropbox');

// Dropbox configuration from environment variables
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || 'hkxnvciw8hwlxob';
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET || '7gpormhtp0s3c4b';

// Validate Dropbox credentials
if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
  console.error('⚠️  WARNING: Dropbox credentials not configured properly');
  console.error('   Please set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env file');
}

// Helper function to get redirect URI based on origin
const getRedirectUri = (origin) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
  const FRONTEND_URL_LOCAL = process.env.FRONTEND_URL_LOCAL || 'http://localhost:3000';
  const FRONTEND_URL_IP = process.env.FRONTEND_URL_IP || 'https://107.161.34.44:8001';
  
  if (!origin || origin === 'none') {
    return `${FRONTEND_URL_LOCAL}/dropbox-callback`;
  }
  
  if (origin.includes('homelife.brokeragelead.ca')) {
    return `${FRONTEND_URL}/dropbox-callback`;
  } else if (origin.includes('107.161.34.44')) {
    return `${FRONTEND_URL_IP}/dropbox-callback`;
  }
  
  return `${FRONTEND_URL_LOCAL}/dropbox-callback`;
};

// Debug endpoint to check configuration
router.get('/debug-config', (req, res) => {
  const origin = req.get('origin') || req.get('referer') || 'none';
  const redirectUri = getRedirectUri(origin);
  
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://homelife.brokeragelead.ca';
  const FRONTEND_URL_LOCAL = process.env.FRONTEND_URL_LOCAL || 'http://localhost:3000';
  const FRONTEND_URL_IP = process.env.FRONTEND_URL_IP || 'http://107.161.34.44:8001';

  res.json({
    success: true,
    config: {
      appKey: DROPBOX_APP_KEY,
      appKeyHidden: `${DROPBOX_APP_KEY.substring(0, 6)}...`,
      detectedOrigin: origin,
      suggestedRedirectUri: redirectUri,
      requiredRedirectUris: [
        `${FRONTEND_URL_LOCAL}/dropbox-callback`,
        `${FRONTEND_URL}/dropbox-callback`,
        `${FRONTEND_URL_IP}/dropbox-callback`
      ],
      instructions: 'Add all requiredRedirectUris to your Dropbox App Console under "Redirect URIs" section, then click Submit',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// Upload PDF to Dropbox
router.post('/upload-pdf', async (req, res) => {
  try {
    const { pdfData, fileName, accessToken } = req.body;

    if (!pdfData || !fileName) {
      return res.status(400).json({ 
        success: false, 
        message: 'PDF data and file name are required' 
      });
    }

    if (!accessToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dropbox access token is required. Please authenticate first.' 
      });
    }

    // Initialize Dropbox client with user's access token
    const dbx = new Dropbox({ 
      accessToken: accessToken,
      fetch: fetch
    });

    // Convert base64 to buffer
    const base64Data = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    // Ensure filename has .pdf extension
    const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    console.log(`Uploading PDF: ${safeName}, Size: ${pdfBuffer.length} bytes`);
    
    // Debug: Check if buffer is empty
    if (pdfBuffer.length === 0) {
      console.error('⚠️ WARNING: PDF buffer is EMPTY!');
      return res.status(400).json({ 
        success: false, 
        message: 'PDF data is empty. The PDF was not generated correctly.' 
      });
    }

    // Upload file to Dropbox with proper content type
    const uploadResponse = await dbx.filesUpload({
      path: `/${safeName}`,  // Fixed: use safeName instead of fileName
      contents: pdfBuffer,
      mode: 'overwrite',  // Changed from 'add' to 'overwrite' to prevent duplicates
      autorename: false,  // Changed to false to prevent automatic renaming
      mute: true,         // Changed to true to prevent notifications
      strict_conflict: false
    });

    console.log('File uploaded to Dropbox successfully:');
    console.log('  - Name:', uploadResponse.result.name);
    console.log('  - Path:', uploadResponse.result.path_display);
    console.log('  - Size:', uploadResponse.result.size);
    console.log('  - Type:', uploadResponse.result['.tag']);

    res.json({
      success: true,
      message: 'PDF uploaded to Dropbox successfully',
      file: {
        name: uploadResponse.result.name,
        path: uploadResponse.result.path_display,
        id: uploadResponse.result.id
      }
    });

  } catch (error) {
    console.error('Error uploading to Dropbox:', error);
    
    let errorMessage = 'Failed to upload PDF to Dropbox';
    if (error.error && error.error.error_summary) {
      errorMessage = error.error.error_summary;
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
});

// Get OAuth URL for user authentication
router.get('/auth-url', (req, res) => {
  try {
    // Always use production URL for redirect
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
    const redirectUri = `${FRONTEND_URL}/dropbox-callback`;
    
    console.log('🔍 Dropbox Auth Request:');
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - App Key:', DROPBOX_APP_KEY);
    console.log('  - Full Auth URL: https://www.dropbox.com/oauth2/authorize?client_id=' + DROPBOX_APP_KEY);
    
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&token_access_type=offline`;

    console.log('⚠️  Make sure this URI is in Dropbox Console:', redirectUri);
    
    res.json({
      success: true,
      authUrl: authUrl,
      redirectUri: redirectUri
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authentication URL'
    });
  }
});

// OAuth callback handler - receives code from Dropbox and redirects to frontend
router.get('/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

    // Check if user denied access
    if (error) {
      console.error('❌ Dropbox OAuth error:', error, error_description);
      const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
      return res.redirect(`${FRONTEND_URL}/dropbox-callback?dropbox_error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      console.error('❌ No authorization code received');
      const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
      return res.redirect(`${FRONTEND_URL}/dropbox-callback?dropbox_error=no_code`);
    }

    console.log('✅ Dropbox OAuth callback received with code');
    console.log('  - Code:', code.substring(0, 20) + '...');

    // Determine the redirect URI that was used
    const origin = req.get('referer') || '';
    let redirectUri = getRedirectUri(origin);
    
    // For production, always use the FRONTEND_URL
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
    redirectUri = `${FRONTEND_URL}/dropbox-callback`;

    console.log('  - Using redirect URI:', redirectUri);

    // Exchange code for access token
    const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('client_id', DROPBOX_APP_KEY);
    params.append('client_secret', DROPBOX_APP_SECRET);
    params.append('redirect_uri', redirectUri);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Token exchange failed:', data);
      throw new Error(data.error_description || 'Failed to exchange token');
    }

    console.log('✅ Token exchange successful');
    console.log('  - Access token received');
    console.log('  - Has refresh token:', !!data.refresh_token);
    console.log('  - Expires in:', data.expires_in, 'seconds');

    // Redirect to frontend dropbox-callback page with tokens in URL parameters
    const successUrl = `${FRONTEND_URL}/dropbox-callback?dropbox_success=true&access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token || '')}&expires_in=${data.expires_in}`;
    
    console.log('  - Redirecting to:', successUrl.split('?')[0] + '?...');
    res.redirect(successUrl);

  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://homelife.brokeragelead.ca';
    res.redirect(`${FRONTEND_URL}/dropbox-callback?dropbox_error=${encodeURIComponent(error.message || 'authentication_failed')}`);
  }
});

// Exchange authorization code for access token
router.post('/exchange-token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('client_id', DROPBOX_APP_KEY);
    params.append('client_secret', DROPBOX_APP_SECRET);
    params.append('redirect_uri', redirectUri || getRedirectUri('none'));

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Failed to exchange token');
    }

    console.log('✅ Token exchanged successfully');
    console.log('  - Has refresh token:', !!data.refresh_token);
    console.log('  - Expires in:', data.expires_in, 'seconds');

    res.json({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token, // ✅ Return refresh token to frontend
      tokenType: data.token_type,
      expiresIn: data.expires_in
    });

  } catch (error) {
    console.error('Error exchanging token:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to exchange authorization code'
    });
  }
});

// Refresh access token using refresh token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    console.log('🔄 Refreshing Dropbox access token...');

    const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', DROPBOX_APP_KEY);
    params.append('client_secret', DROPBOX_APP_SECRET);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Failed to refresh token');
    }

    console.log('✅ Token refreshed successfully');
    console.log('  - New expires in:', data.expires_in, 'seconds');

    res.json({
      success: true,
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in
    });

  } catch (error) {
    console.error('❌ Error refreshing token:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh access token',
      needsReauth: true // Signal to frontend that re-authentication is needed
    });
  }
});

// New endpoint: Receive PDF from frontend and upload to Dropbox
router.post('/upload-pdf-to-dropbox', async (req, res) => {
  try {
    const { pdfBase64, fileName, accessToken } = req.body;

    if (!pdfBase64 || !fileName) {
      return res.status(400).json({ 
        success: false, 
        message: 'PDF data and file name are required' 
      });
    }

    if (!accessToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dropbox access token is required. Please authenticate first.' 
      });
    }

    console.log('📤 Uploading PDF to Dropbox from backend...');
    console.log('  - File name:', fileName);

    // Initialize Dropbox client with user's access token
    const dbx = new Dropbox({ 
      accessToken: accessToken,
      fetch: fetch
    });

    // Convert base64 to buffer
    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    console.log('  - PDF size:', pdfBuffer.length, 'bytes');

    if (pdfBuffer.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'PDF data is empty. The PDF was not generated correctly.' 
      });
    }

    // Ensure filename has .pdf extension
    const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

    // Upload file to Dropbox
    const uploadResponse = await dbx.filesUpload({
      path: `/${safeName}`,
      contents: pdfBuffer,
      mode: 'overwrite',
      autorename: false,
      mute: true,
      strict_conflict: false
    });

    console.log('✅ PDF uploaded to Dropbox successfully!');
    console.log('  - Name:', uploadResponse.result.name);
    console.log('  - Path:', uploadResponse.result.path_display);
    console.log('  - Size:', uploadResponse.result.size, 'bytes');

    res.json({
      success: true,
      message: 'PDF uploaded to Dropbox successfully',
      file: {
        name: uploadResponse.result.name,
        path: uploadResponse.result.path_display,
        id: uploadResponse.result.id,
        size: uploadResponse.result.size
      }
    });

  } catch (error) {
    console.error('❌ Error uploading to Dropbox:', error);
    
    let errorMessage = 'Failed to upload PDF to Dropbox';
    let statusCode = 500;
    
    // Handle expired token
    if (error.status === 401 || error.error?.error?.['.tag'] === 'expired_access_token') {
      errorMessage = 'Access token expired';
      statusCode = 401;
    } else if (error.error && error.error.error_summary) {
      errorMessage = error.error.error_summary;
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      needsTokenRefresh: statusCode === 401
    });
  }
});

module.exports = router;
