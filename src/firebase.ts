import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAjXKgtKgIx_1XyoZV4zl_YohvszuV3g7k",
  authDomain: "katdworks-portfolio.firebaseapp.com",
  projectId: "katdworks-portfolio",
  storageBucket: "katdworks-portfolio.firebasestorage.app",
  messagingSenderId: "374473988192",
  appId: "1:374473988192:web:b8250c858edc25270b0b05"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
