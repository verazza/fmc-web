import express, { Request, Response, NextFunction } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import '../config';
import basepath from '../utils/basepath';
import knex from '../db/knex';
import authenticateJWT, { generateToken, getToken } from '../middlewares/jwt';
import { sendVertificationEmail } from '../controllers/emailController';
import { requireNonLogin } from '../middlewares/checker';
import { loginRedirect, setupAuthRoutes } from '../controllers/authController';

const router: express.Router = express.Router();

setupAuthRoutes(router, [ 'google', 'x', 'discord' ]);

const emailSchema = z.string().email();

router.get('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) {
        //
    } else {
        res.render('auth/verify-form', { title: 'password setting', auth_path: '/set-email', label: 'メールアドレス', input_name: 'email', });
    }
});

router.post('/reset-password', async ( req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    // require validation
});

router.get('/set-email', requireNonLogin, authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.payload) {
        res.status(400).send('Invalid Access');
        return;
    }

    if (req.payload && req.payload2) {
        const check: boolean = req.payload.id === req.payload2.id && req.payload.name === req.payload2.name;
        if (check) {
            try {
                await knex('users').where({ id: req.payload.id }).update({ email: req.payload2.email });

                const user = await knex('users').where({ id: req.payload.id, name: req.payload.name }).first();

                loginRedirect(req, res, next, user, { 'successMessage': [ 'Email setting done successfully' ] });
            } catch (err) {
                res.status(500).send('Error updating email.');
            }
        } else {
            throw new Error('Invalid Access.');
        }
        return;
    }

    const token = req.query.token;
    if (!token) {
        res.status(400).send('Invalid Access');
        return;
    }
    res.render('auth/verify-form', { token, title: 'email setting', auth_path: '/set-email', label: 'メールアドレス', input_name: 'email', });
});

router.post('/set-email', requireNonLogin, authenticateJWT, async (req: Request, res: Response) => {
    if (!req.payload) {
        res.status(400).send('Invalid Access');
        throw new Error('Invalid Access');
    }

    const { email } = req.body;
    // require validation

    const oldtoken: string = await getToken(req.payload);

    const newPayload: JwtPayload = { id: req.payload.id, name: req.payload.name, email };
    const newtoken = await generateToken(req.payload, false, newPayload);

    const redirectUrl: string = `${basepath.rooturl}auth/set-email?token=${oldtoken}&token2=${newtoken}`;

    const send = await sendVertificationEmail(email, redirectUrl);
    if (send) {
        res.render('index', { successMessage: [ 'Sent email successfully!' ] });
    } else {
        res.render('index', { errorMessage: [ 'Failed to send email.' ] });
    }
});

router.get('/verify-otp', requireNonLogin, authenticateJWT, async (req: Request, res: Response) => {
    if (!req.payload) {
        res.status(400).send('Invalid Access');
        return;
    }

    const token = req.query.token;

    res.render('auth/verify-form', { token, title: 'otp confirm', auth_path: '/verify-otp', label: 'ワンタイムパスワード', input_name: 'otp', });
});

router.post('/verify-otp', requireNonLogin, authenticateJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.payload) {
        res.status(400).send('Invalid Access');
        return;
    }

    const { otp } = req.body;

    try {
        const isValid = await knex('users').where({ id: req.payload.id, name: req.payload.name, otp }).first();
        if (!isValid) {
            res.status(400).send('Invalid Access');
            return;
        }

        await knex('users').where({ id: req.payload.id, name: req.payload.name, otp }).update({ otp: null });

        const user = await knex('users').where({ id: req.payload.id, name: req.payload.name }).first();

        loginRedirect(req, res, next, user, { 'successMessage': [ 'OTP setting done successfully' ] });
    } catch (error) {
        res.status(500).send('Invalid Access');
    }
});

export default router;
