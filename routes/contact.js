const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// @route   POST api/contact
// @desc    Handle contact form submissions
// @access  Public
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  try {
    const newMessage = new Message({
      name,
      email,
      subject,
      message
    });

    await newMessage.save();

    // Notify n8n Webhook
    try {
      const axios = require('axios');
      const n8nUrl = 'https://ahmeddd111.app.n8n.cloud/webhook/dfa3be7f-785a-4472-95b8-b9c5fb5bdeeb';
      await axios.post(n8nUrl, {
        action: 'new_contact_message',
        name,
        email,
        subject,
        message
      }, { timeout: 5000 });
    } catch (n8nErr) {
      console.warn('[Contact n8n Notify Failed]', n8nErr.message);
    }

    res.status(200).json({ 
      success: true, 
      message: 'Message received! Thank you for contacting us.' 
    });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

module.exports = router;
