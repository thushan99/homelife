# Dropbox OAuth - Redirect Back to Same Page Fix

## Problem
After Dropbox authentication, users were always redirected to `/transactions` page instead of being returned to the page they were on (like `/trade-info`) with the modal reopened.

## Solution
Store the current page URL before OAuth and redirect back to it after authentication, then automatically reopen the modal.

## Changes Made

### 1. **DropboxCallback Page** (`frontend/src/pages/DropboxCallback.jsx`)
✅ Modified all redirect logic to use stored URL:
- Reads `dropboxRedirectUrl` from localStorage
- Defaults to `/transactions` if not set
- Cleans up the stored URL after redirect
- Passes `pendingTradeId` in navigation state

**Key Changes:**
```javascript
const redirectUrl = localStorage.getItem('dropboxRedirectUrl') || '/transactions';
localStorage.removeItem('dropboxRedirectUrl');

navigate(redirectUrl, { 
  replace: true,
  state: { dropboxConnected: true, pendingTradeId }
});
```

### 2. **TradeDetailsModal** (`frontend/src/components/TradeDetailsModal.jsx`)
✅ Modified `handleDropboxAuth` to store current page URL:

```javascript
// Store current trade ID and page URL for callback
localStorage.setItem("pendingDropboxUploadTradeId", trade._id);
localStorage.setItem("dropboxRedirectUrl", window.location.pathname);
```

This ensures that:
- Current page path is stored (e.g., `/trade-info`)
- Trade ID is stored to reopen the correct modal
- Both are available when callback returns

### 3. **TradeInfo Component** (`frontend/src/components/TradeInfo.jsx`)
✅ Added import for `useLocation`:
```javascript
import { useLocation } from "react-router-dom";
const location = useLocation();
```

✅ Added new useEffect to handle Dropbox callback:
```javascript
useEffect(() => {
  if (location.state?.dropboxConnected && location.state?.pendingTradeId) {
    console.log('🔄 Dropbox connected! Reopening modal for trade:', location.state.pendingTradeId);
    
    // Find the trade by ID
    const trade = trades.find(t => t._id === location.state.pendingTradeId);
    
    if (trade) {
      setSelectedTrade(trade);
      setShowTradeModal(true);
      toast.success('Dropbox connected successfully! You can now upload PDFs.');
    }
    
    // Clear the state
    window.history.replaceState({}, document.title);
  }
}, [location.state, trades]);
```

This:
- Detects when user returns from Dropbox OAuth
- Finds the trade they were viewing
- Reopens the TradeDetailsModal automatically
- Shows success toast message
- Clears navigation state

## How It Works Now

### Complete Flow:

1. **User on `/trade-info` page**
   - Opens a trade modal
   - Clicks "Connect to Dropbox"

2. **Before OAuth redirect:**
   ```javascript
   localStorage.setItem("dropboxRedirectUrl", "/trade-info")
   localStorage.setItem("pendingDropboxUploadTradeId", "trade123")
   ```

3. **Dropbox OAuth flow:**
   - User authorizes
   - Dropbox redirects: `/dropbox-callback?code=...`

4. **Callback page processes:**
   - Exchanges code for tokens
   - Stores tokens in localStorage
   - Reads: `dropboxRedirectUrl = "/trade-info"`
   - Redirects to: `/trade-info` with state

5. **Back on `/trade-info`:**
   - useEffect detects `location.state.dropboxConnected`
   - Finds trade by `pendingTradeId`
   - Opens TradeDetailsModal automatically
   - Shows success message
   - User can now upload to Dropbox!

## Benefits

✅ **Better UX**: Users stay on the page they were working on
✅ **Modal Auto-Opens**: No need to find and reopen the trade
✅ **Context Preserved**: User continues where they left off
✅ **Success Feedback**: Toast notification confirms connection
✅ **Works Anywhere**: Will work from any page (not just TradeInfo)

## Testing

1. Go to `/trade-info`
2. Open any trade modal
3. Click "Connect to Dropbox"
4. Authorize on Dropbox
5. **Expected Result:**
   - Redirected back to `/trade-info`
   - Same modal opens automatically
   - Success message appears
   - Can now upload PDFs

## Files Modified

- ✅ `frontend/src/pages/DropboxCallback.jsx` - Redirect to stored URL
- ✅ `frontend/src/components/TradeDetailsModal.jsx` - Store current URL
- ✅ `frontend/src/components/TradeInfo.jsx` - Auto-reopen modal on return

## Deployment

After making these changes:

```bash
cd frontend
npm run build
pm2 restart homelife
```

Test the complete flow to verify everything works!
