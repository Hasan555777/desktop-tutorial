import React, { useState } from 'react';

function PortfolioSection({ onBack }) {
  const [experience, setExperience] = useState([
    { id: 1, role: 'Senior Developer', company: 'Tech Corp', duration: '2020-2024' }
  ]);

  return (
    <div className="section-page active">
      <div className="section-header">
        <button className="back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <div className="section-title">
          <i className="fas fa-folder-open" style={{ marginRight: '10px', color: '#7c3aed' }}></i>
          Portfolio
        </div>
      </div>

      <div className="section-content">
        <h4 style={{ marginBottom: '10px' }}><i className="fas fa-briefcase"></i> Experience</h4>
        {experience.map(exp => (
          <div key={exp.id} className="detail-item">
            <i className="fas fa-building"></i>
            <span className="detail-label">{exp.role} at {exp.company}</span>
            <span className="detail-value">{exp.duration}</span>
          </div>
        ))}

        <h4 style={{ marginTop: '16px', marginBottom: '10px' }}><i className="fas fa-graduation-cap"></i> Education</h4>
        <div className="detail-item">
          <i className="fas fa-university"></i>
          <span className="detail-label">B.Sc in Computer Science</span>
          <span className="detail-value">2016-2020</span>
        </div>

        <h4 style={{ marginTop: '16px', marginBottom: '10px' }}><i className="fas fa-code"></i> Skills</h4>
        <div className="skills-chip-container">
          <span className="skill-chip">React</span>
          <span className="skill-chip">Node.js</span>
          <span className="skill-chip">Firebase</span>
          <span className="skill-chip">Tailwind CSS</span>
        </div>

        <h4 style={{ marginTop: '16px', marginBottom: '10px' }}><i className="fas fa-award"></i> Certificates</h4>
        <div className="detail-item">
          <i className="fas fa-certificate"></i>
          <span className="detail-label">AWS Certified</span>
          <span className="detail-value">2023</span>
        </div>
      </div>
    </div>
  );
}

export default PortfolioSection;