import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      console.log('Sending registration data:', { name, email, password });
      const response = await axios.post(`${API_URL}/auth/register`, {
        name,
        email,
        password
      });
      console.log('Registration response:', response.data);
      login(response.data.token);
      navigate('/');
    } catch (err) {
      console.error('Registration error:', err.response?.data || err.message);
      setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'An error occurred');
    }
  };

  return (
    <div className="auth-container">
      <h2>Register</h2>
      {error && <div className="error" style={{color: 'red', marginBottom: '10px'}}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Register</button>
      </form>
      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}

export default Register;
