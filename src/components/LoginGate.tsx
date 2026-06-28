import React from "react";

interface LoginGateProps {
  onLogin: (username: string) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onLogin }) => {
  return (
    <div className="login-gate-container">
      <div className="login-card brutal-card brutal-shadow">
        <div className="login-title-wrapper">
          <h1 style={{ margin: 0, fontSize: "3rem", lineHeight: 1.1 }}>
            BRUTAL
            <br />
            CHECKERS
          </h1>
          <div
            className="sidebar-version"
            style={{ marginTop: "8px", fontWeight: "bold" }}
          >
            SYS.VER // 1.0.4-STABLE
          </div>
        </div>

        <p style={{ fontSize: "1.1rem", lineHeight: "1.4", margin: "8px 0" }}>
          SELECT A USER SESSION ACCOUNT TO ESTABLISH AN ONLINE CONVEX CONNECTION.
        </p>

        <div className="login-options">
          <button
            className="brutal-button primary"
            onClick={() => onLogin("Lordin")}
            style={{ fontSize: "1.3rem", padding: "16px" }}
          >
            LOGIN AS LORDIN
          </button>
          <button
            className="brutal-button accent"
            onClick={() => onLogin("Laura")}
            style={{ fontSize: "1.3rem", padding: "16px" }}
          >
            LOGIN AS LAURA
          </button>
        </div>

        <div
          style={{
            fontSize: "0.8rem",
            color: "#666",
            borderTop: "2px solid #000",
            paddingTop: "16px",
            marginTop: "8px",
          }}
        >
          // AUTHENTICATED BY CONVEX CLOUD BACKEND
        </div>
      </div>
    </div>
  );
};
