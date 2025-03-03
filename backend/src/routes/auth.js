const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken'); 
const User = require('../models/user');

// Debug middleware for auth routes
router.use((req, res, next) => {
    console.log('\n Auth Request Details:');
    console.log(' Path:', req.path);
    console.log(' Body:', JSON.stringify(req.body, null, 2));
    console.log(' Headers:', JSON.stringify(req.headers, null, 2));
    next();
});

// Register user
router.post('/register',
    [
        body('email').isEmail(),
        body('password').isLength({ min: 6 }),
        body('name').notEmpty()
    ],
    async (req, res) => {
        try {
            console.log('\n Starting Registration Process');
            
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log(' Validation Errors:', JSON.stringify(errors.array(), null, 2));
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password, name } = req.body;
            console.log(' Attempting to register:', email);

            // Check if user exists
            let existingUser = await User.findOne({ email });
            if (existingUser) {
                console.log(' User already exists:', email);
                return res.status(400).json({ message: 'User already exists' });
            }

            // Create new user
            console.log(' Creating new user object...');
            const user = new User({ name, email, password });
            
            try {
                await user.save();
                console.log(' User saved successfully');
            } catch (saveError) {
                console.error(' Error saving user:', saveError);
                console.error('Error details:', {
                    name: saveError.name,
                    message: saveError.message,
                    stack: saveError.stack
                });
                throw saveError;
            }

            // Generate token
            console.log(' Generating auth token...');
            let token;
            try {
                token = await user.generateAuthToken();
                console.log(' Token generated successfully');
            } catch (tokenError) {
                console.error(' Error generating token:', tokenError);
                console.error('Error details:', {
                    name: tokenError.name,
                    message: tokenError.message,
                    stack: tokenError.stack
                });
                throw tokenError;
            }

            console.log(' Registration successful');
            res.status(201).json({
                token,
                user: user.toJSON()
            });
        } catch (error) {
            console.error('\n Registration Error:');
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Error details:', error);
            
            res.status(500).json({ 
                message: 'Server error during registration',
                error: process.env.NODE_ENV === 'development' ? {
                    message: error.message,
                    stack: error.stack
                } : undefined
            });
        }
    }
);

// Login user
router.post('/login',
    [
        body('email').isEmail(),
        body('password').exists()
    ],
    async (req, res) => {
        try {
            console.log('\n Starting Login Process');
            
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log(' Validation Errors:', JSON.stringify(errors.array(), null, 2));
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;
            console.log(' Attempting login for:', email);

            try {
                console.log(' Finding user and validating credentials...');
                const user = await User.findByCredentials(email, password);
                console.log(' Credentials validated for:', email);

                console.log(' Generating new token...');
                const token = await user.generateAuthToken();
                console.log(' Token generated successfully');

                res.json({
                    token,
                    user: user.toJSON()
                });
            } catch (authError) {
                console.error(' Authentication Error:');
                console.error('Error details:', {
                    name: authError.name,
                    message: authError.message,
                    stack: authError.stack
                });
                return res.status(401).json({ message: 'Invalid credentials' });
            }
        } catch (error) {
            console.error('\n Login Error:');
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            console.error('Error details:', error);
            
            res.status(500).json({ 
                message: 'Server error during login',
                error: process.env.NODE_ENV === 'development' ? {
                    message: error.message,
                    stack: error.stack
                } : undefined
            });
        }
    }
);

// Get user profile
router.get('/me', async (req, res) => {
    try {
        console.log('\n Getting User Profile');
        
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            console.log(' No token provided');
            return res.status(401).json({ message: 'Authentication required' });
        }

        try {
            console.log(' Verifying token...');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log(' Token verified');

            const user = await User.findOne({
                _id: decoded.userId,
                'tokens.token': token
            });

            if (!user) {
                console.log(' User not found for token');
                return res.status(401).json({ message: 'Authentication required' });
            }

            console.log(' User found:', user.email);
            res.json({ user: user.toJSON() });
        } catch (tokenError) {
            console.error(' Token Verification Error:', tokenError);
            res.status(401).json({ message: 'Authentication required' });
        }
    } catch (error) {
        console.error('\n Profile Error:');
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
