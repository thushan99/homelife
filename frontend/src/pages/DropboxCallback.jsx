import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../config/axios';

const DropboxCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing Dropbox authentication...');

  useEffect(() => {
    const handleCallback = async () => {
      // Parse URL parameters
      const params = new URLSearchParams(location.search);
      
      const code = params.get('code');
      const success = params.get('dropbox_success');
      const error = params.get('dropbox_error');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');

      console.log('🔍 Dropbox Callback Handler:');
      console.log('  - Code:', code ? code.substring(0, 20) + '...' : null);
      console.log('  - Success:', success);
      console.log('  - Error:', error);
      console.log('  - Has Access Token:', !!accessToken);
      console.log('  - Has Refresh Token:', !!refreshToken);
      console.log('  - URL:', location.pathname + location.search);

      // Case 1: Dropbox redirected with authorization code - need to exchange it
      if (code && !accessToken) {
        console.log('📤 Exchanging authorization code for tokens...');
        setMessage('Exchanging authorization code for access tokens...');
        
        try {
          const redirectUri = `${window.location.origin}/dropbox-callback`;
          const response = await axiosInstance.post('/dropbox/exchange-token', {
            code,
            redirectUri
          });

          if (response.data.success) {
            const { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: newExpiresIn } = response.data;
            
            // Store tokens
            localStorage.setItem('dropboxAccessToken', newAccessToken);
            if (newRefreshToken) {
              localStorage.setItem('dropboxRefreshToken', newRefreshToken);
            }
            if (newExpiresIn) {
              const expiryTime = Date.now() + (parseInt(newExpiresIn) * 1000);
              localStorage.setItem('dropboxTokenExpiry', expiryTime.toString());
            }

            console.log('✅ Tokens exchanged and stored successfully');
            setStatus('success');
            setMessage('Dropbox connected successfully! Redirecting...');

            // Check for pending upload and redirect URL
            const pendingTradeId = localStorage.getItem('pendingDropboxUploadTradeId');
            const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
            
            setTimeout(() => {
              if (pendingTradeId) {
                console.log('📤 Pending upload detected for trade:', pendingTradeId);
                localStorage.removeItem('pendingDropboxUploadTradeId');
              }
              console.log('🔄 Redirecting back to:', redirectUrl);
              localStorage.removeItem('dropboxRedirectUrl');
              
              navigate(redirectUrl, { 
                replace: true,
                state: { dropboxConnected: true, pendingTradeId }
              });
            }, 2000);
            return;
          }
        } catch (error) {
          console.error('❌ Token exchange failed:', error);
          setStatus('error');
          setMessage(`Failed to exchange token: ${error.response?.data?.message || error.message}`);
          
          const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
          localStorage.removeItem('dropboxRedirectUrl');
          
          setTimeout(() => {
            navigate(redirectUrl, { replace: true });
          }, 3000);
          return;
        }
      }

      // Case 2: Already has tokens from backend redirect (shouldn't happen now, but keep for safety)
      if (success === 'true' && accessToken) {
        console.log('✅ Received tokens from backend');
        localStorage.setItem('dropboxAccessToken', accessToken);
        if (refreshToken) {
          localStorage.setItem('dropboxRefreshToken', refreshToken);
        }
        if (expiresIn) {
          const expiryTime = Date.now() + (parseInt(expiresIn) * 1000);
          localStorage.setItem('dropboxTokenExpiry', expiryTime.toString());
        }

        setStatus('success');
        setMessage('Dropbox connected successfully! Redirecting...');

        const pendingTradeId = localStorage.getItem('pendingDropboxUploadTradeId');
        const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
        
        setTimeout(() => {
          if (pendingTradeId) {
            localStorage.removeItem('pendingDropboxUploadTradeId');
          }
          localStorage.removeItem('dropboxRedirectUrl');
          
          navigate(redirectUrl, { 
            replace: true,
            state: { dropboxConnected: true, pendingTradeId }
          });
        }, 2000);
        return;
      }

      // Case 3: Error from Dropbox or backend
      if (error) {
        setStatus('error');
        setMessage(`Authentication failed: ${decodeURIComponent(error)}`);
        console.error('❌ Dropbox authentication failed:', error);
        
        const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
        localStorage.removeItem('dropboxRedirectUrl');
        
        setTimeout(() => {
          navigate(redirectUrl, { replace: true });
        }, 3000);
        return;
      }

      // Case 4: No relevant parameters - user navigated here directly
      if (!code && !success && !error && !accessToken) {
        console.log('⚠️ No callback parameters found - redirecting back');
        const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
        localStorage.removeItem('dropboxRedirectUrl');
        navigate(redirectUrl, { replace: true });
        return;
      }

      // Case 5: Unexpected state
      setStatus('error');
      setMessage('Unexpected authentication response. Please try again.');
      console.error('❌ Unexpected callback state');
      
      const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
      localStorage.removeItem('dropboxRedirectUrl');
      
      setTimeout(() => {
        navigate(redirectUrl, { replace: true });
      }, 3000);
    };

    handleCallback();
  }, [location, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        {status === 'processing' && (
          <div>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Processing...</h2>
            <p className="text-gray-600">{message}</p>
          </div>
        )}
        
        {status === 'success' && (
          <div>
            <div className="text-green-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-green-600">Success!</h2>
            <p className="text-gray-600">{message}</p>
          </div>
        )}
        
        {status === 'error' && (
          <div>
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Error</h2>
            <p className="text-gray-600">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DropboxCallback;
