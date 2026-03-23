## Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel.
2. Keep the default build command as `npm run build`.
3. Use the included [vercel.json](vercel.json) so client-side routes like `/login` and `/dashboard` resolve to the SPA entry point.
4. Set the Cloudinary environment variable in Vercel: `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@dzfy4gl5z`.
5. Set any other required environment variables in Vercel, including `GEMINI_API_KEY` if the app uses it in production.

Notes:

- Uploads now use Cloudinary signed uploads in both local development and production.
- Keep the Cloudinary secret only in local env files and Vercel secrets.
