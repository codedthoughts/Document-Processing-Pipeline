import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = 'http://localhost:8000/api';
const POLLING_INTERVAL = 3000; // Poll every 3 seconds

function Dashboard() {
  const { token, logout } = useAuth();
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasProcessingDocs, setHasProcessingDocs] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(response.data);
      
      // Check if any documents are still processing
      const processingDocs = response.data.some(doc => doc.status === 'processing');
      setHasProcessingDocs(processingDocs);
    } catch (err) {
      setError('Failed to fetch documents');
    }
  }, [token]);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/documents/queue/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQueueStatus(response.data);
    } catch (err) {
      console.error('Failed to fetch queue status:', err);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchDocuments();
    fetchQueueStatus(); // Fetch queue status on initial load
  }, [fetchDocuments, fetchQueueStatus]);

  // Polling for updates when documents are processing
  useEffect(() => {
    let pollInterval;
    
    if (hasProcessingDocs) {
      // Immediately fetch status when processing starts
      fetchQueueStatus();
      
      pollInterval = setInterval(() => {
        fetchDocuments();
        fetchQueueStatus();
      }, POLLING_INTERVAL);
      console.log('🔄 Polling for updates...');
    } else {
      // When no documents are processing, reset queue status after a delay
      const resetTimer = setTimeout(() => {
        setQueueStatus(prev => prev && {
          ...prev,
          waiting: 0,
          active: 0
        });
      }, POLLING_INTERVAL);
      
      return () => clearTimeout(resetTimer);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        console.log('⏹️ Stopped polling for updates');
      }
    };
  }, [hasProcessingDocs, fetchDocuments, fetchQueueStatus]);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file || file.length === 0) return;

    const formData = new FormData();
    for (const f of file) {
      formData.append('files', f);
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setFile(null);
      // Reset the file input
      e.target.reset();
      await fetchDocuments(); // Immediate fetch after upload
      setHasProcessingDocs(true); // Start polling
      
      // Show success message with number of files uploaded
      const numFiles = response.data.documentIds.length;
      setError(`Successfully queued ${numFiles} ${numFiles === 1 ? 'file' : 'files'} for processing`);
      setTimeout(() => setError(''), 3000); // Clear message after 3 seconds
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.message || 'Failed to upload documents');
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchKeyword) {
      fetchDocuments();
      return;
    }

    try {
      const response = await axios.get(
        `${API_URL}/documents/search/${searchKeyword}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setDocuments(response.data);
    } catch (err) {
      setError('Failed to search documents');
    }
  };

  return (
    <div className="dashboard">
      <header>
        <h1>Document Processing Pipeline</h1>
        <button onClick={logout}>Logout</button>
      </header>

      {error && <div className="error">{error}</div>}

      {queueStatus && (
        <div className="queue-status">
          <h3>Processing Queue Status</h3>
          <div className="status-grid">
            <div className={`status-item ${queueStatus.waiting > 0 ? 'active' : ''}`}>
              <span>🕒 Waiting</span>
              <span>{queueStatus.waiting}</span>
            </div>
            <div className={`status-item ${queueStatus.active > 0 ? 'active' : ''}`}>
              <span>⚡ Active</span>
              <span>{queueStatus.active}</span>
            </div>
            <div className={`status-item ${queueStatus.completed > 0 ? 'active' : ''}`}>
              <span>✅ Completed</span>
              <span>{queueStatus.completed}</span>
            </div>
            <div className={`status-item ${queueStatus.failed > 0 ? 'active' : ''}`}>
              <span>❌ Failed</span>
              <span>{queueStatus.failed}</span>
            </div>
          </div>
          <small>Last updated: {new Date(queueStatus.timestamp).toLocaleTimeString()}</small>
        </div>
      )}

      <div className="upload-section">
        <form onSubmit={handleFileUpload}>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files)}
            accept=".pdf,.txt,.docx,.jpg,.jpeg,.png"
            multiple
          />
          <button type="submit" disabled={!file || loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search documents..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      <div className="documents-list">
        <h2>Your Documents</h2>
        {documents.length === 0 ? (
          <p>No documents found</p>
        ) : (
          documents.map((doc) => (
            <div key={doc._id} className="document-item">
              <h3>{doc.originalName}</h3>
              <p>Status: {doc.status === 'processing' ? '🔄 Processing...' : doc.status}</p>
              {doc.status === 'completed' && (
                <>
                  <p>Summary: {doc.summary}</p>
                  <div className="document-links">
                    <a href={`http://localhost:8000${doc.processedUrl}`} target="_blank" rel="noopener noreferrer">
                      View Processed Document
                    </a>
                    <a href={`http://localhost:8000${doc.originalUrl}`} target="_blank" rel="noopener noreferrer">
                      View Original Document
                    </a>
                  </div>
                </>
              )}
              {doc.status === 'failed' && <p>Error: {doc.error}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Dashboard;
