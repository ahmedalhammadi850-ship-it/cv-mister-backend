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
