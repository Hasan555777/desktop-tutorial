// src/components/AIAssistant.jsx
import React, { useState } from 'react';
import './AIAssistant.css';

const AIAssistant = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [inputText, setInputText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  const handleAskAI = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setAiResponse('');

    try {
      // ✅ হুবহু আপনার curl কমান্ডের মতো
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: inputText }] }]
          })
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'কোনো উত্তর পাওয়া যায়নি।';
      setAiResponse(reply);
    } catch (error) {
      console.error('AI Error:', error);
      setAiResponse('❌ AI তে সমস্যা হয়েছে। API কী বা নেটওয়ার্ক চেক করুন।');
    } finally {
      setLoading(false);
    }
  };

  // --- প্রি-সেট প্রম্পট ---
  const handleQuickPrompt = (type) => {
    const prompts = {
      job: 'একজন সিনিয়র React Developer এর জন্য একটি আকর্ষণীয় চাকরির বিজ্ঞাপন লিখুন। বাজেট ৮০,০০০ টাকা, সময়সীমা ১৫ দিন।',
      summary: 'React, Firebase এবং Tailwind CSS ব্যবহার করে ই-কমার্স সাইট তৈরির সুবিধা ও চ্যালেঞ্জ সংক্ষেপে লিখুন।',
      fix: 'React-এ `useEffect` ক্লিনআপ ফাংশন কাজ করছে না। কেন এবং সমাধান কী?',
      email: 'একজন ক্লায়েন্টকে নতুন সার্ভিস অফার করার জন্য পেশাদার ইমেইল ড্রাফট তৈরি করুন।'
    };
    setInputText(prompts[type] || '');
  };

  return (
    <div className="ai-assistant-container">
      <h2>🤖 AI অলরাউন্ডার সহায়ক</h2>
      <p className="ai-subtitle">Google Gemini চালিত | সব ফিচার এক জায়গায়</p>

      <div className="ai-tabs">
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>💬 চ্যাট</button>
        <button className={activeTab === 'job' ? 'active' : ''} onClick={() => setActiveTab('job')}>📝 জব জেনারেটর</button>
        <button className={activeTab === 'helper' ? 'active' : ''} onClick={() => setActiveTab('helper')}>🔧 কোড হেল্পার</button>
        <button className={activeTab === 'email' ? 'active' : ''} onClick={() => setActiveTab('email')}>✉️ ইমেইল ড্রাফট</button>
      </div>

      <div className="ai-input-area">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            activeTab === 'chat' ? 'যেকোনো প্রশ্ন লিখুন...' :
            activeTab === 'job' ? 'কাজের ধরন ও বাজেট লিখুন...' :
            activeTab === 'helper' ? 'কোড বা টেকনিক্যাল প্রশ্ন লিখুন...' :
            'কার কাছে, কী বিষয়ে ইমেইল লিখবেন...'
          }
          rows={4}
        />
        
        <div className="quick-buttons">
          {activeTab === 'job' && <button onClick={() => handleQuickPrompt('job')}>📌 জব পোস্ট উদাহরণ</button>}
          {activeTab === 'helper' && <button onClick={() => handleQuickPrompt('summary')}>📋 সারাংশ</button>}
          {activeTab === 'helper' && <button onClick={() => handleQuickPrompt('fix')}>🔧 কোড ফিক্স</button>}
          {activeTab === 'email' && <button onClick={() => handleQuickPrompt('email')}>📧 ইমেইল ড্রাফট</button>}
        </div>
        
        <button className="ai-send-btn" onClick={handleAskAI} disabled={loading}>
          {loading ? '⏳ চিন্তা করছে...' : `🚀 ${activeTab === 'chat' ? 'জিজ্ঞাসা করুন' : 'জেনারেট করুন'}`}
        </button>
      </div>

      {aiResponse && (
        <div className="ai-response-box">
          <strong>🤖 AI উত্তর:</strong>
          <div className="ai-response-text">{aiResponse}</div>
        </div>
      )}
    </div>
  );
};

export default AIAssistant;