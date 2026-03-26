# Security Notes

## Fixed Security Issues

### 1. Hardcoded Firebase Credentials (CRITICAL - Fixed)
**Issue**: Firebase API keys and configuration were hardcoded in `src/firebase.ts`

**Fix**: Moved all Firebase configuration to environment variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

**Action Required**: 
1. Create a `.env` file based on `.env.example`
2. Add your actual Firebase credentials to `.env`
3. Add these environment variables to Vercel:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all `VITE_FIREBASE_*` variables with your actual values

### 2. XSS Risk Warnings (False Positives)
**Issue**: Security scanner flagged `res.end(JSON.stringify(...))` as potential XSS

**Status**: These are false positives. The code:
- Uses `JSON.stringify()` which escapes all special characters
- Sets proper `Content-Type: application/json` headers
- Does not render user input as HTML

No action required.

### 3. Dependency Vulnerabilities
**Issue**: `picomatch@4.0.3` has 2 medium severity vulnerabilities

**Recommendation**: 
```bash
npm audit fix
```

## Environment Variables Required

### Local Development (.env file)
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# Cloudinary
CLOUDINARY_URL="cloudinary://api_key:api_secret@cloud_name"

# Optional: Gemini AI
GEMINI_API_KEY="your-gemini-key"
```

### Vercel Production
Add the same variables in Vercel Dashboard → Settings → Environment Variables

## Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Rotate credentials** if they were previously exposed
3. **Use Firebase Security Rules** to restrict database access
4. **Enable Cloudinary signed uploads** (already implemented)
5. **Keep dependencies updated** - Run `npm audit` regularly

## Firebase Security Rules

Ensure your Firestore has proper security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Portfolio data - public read, admin write
    match /portfolio/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Analytics - admin only
    match /analytics/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    match /analytics_daily/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Contact

For security concerns, please create an issue or contact the repository owner.
