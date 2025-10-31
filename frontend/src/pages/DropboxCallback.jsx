import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const DropboxCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing Dropbox authentication...');

  useEffect(() => {
    const handleCallback = () => {
      // Parse URL parameters
      const params = new URLSearchParams(location.search);
      
      const success = params.get('dropbox_success');
      const error = params.get('dropbox_error');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');

      console.log('🔍 Dropbox Callback Handler:');
      console.log('  - Success:', success);
      console.log('  - Error:', error);
      console.log('  - Has Access Token:', !!accessToken);
      console.log('  - Has Refresh Token:', !!refreshToken);
      console.log('  - URL:', location.pathname + location.search);

      // If no parameters, user navigated here directly - just redirect
      if (!success && !error && !accessToken) {
        console.log('⚠️ No callback parameters found - redirecting to transactions');
        navigate('/transactions', { replace: true });
        return;
      }

      if (error) {
        // Authentication failed
        setStatus('error');
        setMessage(`Authentication failed: ${decodeURIComponent(error)}`);
        console.error('❌ Dropbox authentication failed:', error);
        
        // Redirect back after 3 seconds
        setTimeout(() => {
          navigate('/transactions', { replace: true });
        }, 3000);
        return;
      }

      if (success === 'true' && accessToken) {
        // Store tokens in localStorage
        localStorage.setItem('dropboxAccessToken', accessToken);
        
        if (refreshToken) {
          localStorage.setItem('dropboxRefreshToken', refreshToken);
        }
        
        if (expiresIn) {
          const expiryTime = Date.now() + (parseInt(expiresIn) * 1000);
          localStorage.setItem('dropboxTokenExpiry', expiryTime.toString());
        }

        console.log('✅ Dropbox tokens stored successfully');
        setStatus('success');
        setMessage('Dropbox connected successfully! Redirecting...');

        // Check if there's a pending upload
        const pendingTradeId = localStorage.getItem('pendingDropboxUploadTradeId');
        
        // Redirect back to transactions page
        setTimeout(() => {
          if (pendingTradeId) {
            console.log('📤 Pending upload detected for trade:', pendingTradeId);
            localStorage.removeItem('pendingDropboxUploadTradeId');
          }
          navigate('/transactions', { 
            replace: true,
            state: { dropboxConnected: true, pendingTradeId }
          });
        }, 2000);
      } else {
        // Unexpected state - has some params but not the right ones
        setStatus('error');
        setMessage('Unexpected authentication response. Please try again.');
        console.error('❌ Unexpected callback state - params present but invalid');
        
        setTimeout(() => {
          navigate('/transactions', { replace: true });
        }, 3000);
      }
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
