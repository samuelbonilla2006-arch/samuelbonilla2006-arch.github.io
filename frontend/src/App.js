import { useEffect } from "react";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  useEffect(() => {
    // Route to login.html or titan.html based on auth state
    const route = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/check-auth`);
        const data = await res.json();
        window.location.replace(data.authenticated ? "/titan.html" : "/login.html");
      } catch {
        window.location.replace("/login.html");
      }
    };
    route();
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#05070a", color: "#5d6679",
      fontFamily: "monospace", fontSize: "12px", letterSpacing: "0.2em"
    }}>
      LOADING TITÁN TERMINAL…
    </div>
  );
}

export default App;
