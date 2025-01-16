import express, { Request, Response } from 'express';
import passport from 'passport';
import { JwtPayload } from 'jsonwebtoken';
import '../config';
import basepath from '../utils/basepath';
import knex from '../db/knex';
import authenticateJWT, { generateToken, getToken } from '../middlewares/jwt';
import { sendVertificationEmail } from '../controllers/emailController';
import { requireNonLogin } from '../middlewares/checker';

const router: express.Router = express.Router();

async function loginRedirect(req: Request, res: Response, data: any, timeout: number = 3000) {
    if (!req.payload) {
        res.status(400).send('Invalid Payload');
        throw new Error("Invalid Payload");
    }

    if (typeof data.redirect_url != 'string') {
        throw new Error("Must be included redirect_url: string in data");
    }

    data['timeout'] = timeout;

    const user = await knex('users').where({ id: req.payload.id, name: req.payload.name }).first();
    req.login(user, (err) => {
        if (err) {
            res.status(500).send('Error logging in');
            return;
        }

        res.render('redirect', data);
    });
}

router.get('/set-email', requireNonLogin, authenticateJWT, async (req: Request, res: Response) => {
    if (!req.payload) {
        return;
    }

    if (req.payload && req.payload2) {
        const check: boolean = req.payload.id === req.payload2.id && req.payload.name === req.payload2.name;
        if (check) {
            try {
                await knex('users').where({ id: req.payload.id }).update({ email: req.payload2.email });

                await loginRedirect(req, res, {
                    'redirect_url': basepath.successurl,
                    'successMessage': [ 'Email setting done successfully' ],
                });
            } catch (err) {
                res.status(500).send('Error updating email.');
            }
        } else {
            throw new Error('Invalid Access.');
        }
        return;
    }

    const token = req.query.token;
    res.render('auth/verify-form', { token, title: 'email setting', auth_path: '/set-email', label: 'メールアドレス', input_name: 'email', });
});

router.post('/set-email', requireNonLogin, authenticateJWT, async (req: Request, res: Response) => {
    if (!req.payload) {
        throw new Error('Invalid Access.');
    }

    const { email } = req.body;

    const oldtoken: string = await getToken(req.payload);

    const newPayload: JwtPayload = { id: req.payload.id, name: req.payload.name, email };
    const newtoken = await generateToken(req.payload, false, newPayload);

    const redirectUrl: string =  `${basepath.rooturl}auth/set-email?token=${oldtoken}&token2=${newtoken}`;

    const send = await sendVertificationEmail(email, redirectUrl);
    if (send) {
        res.render('index', { successMessage: [ 'Sent email successfully!' ] });
    } else {
        res.render('index', { errorMessage: [ 'Failed to send email.' ] });
    }
});

router.get('/verify-otp', requireNonLogin, authenticateJWT, async (req: Request, res: Response) => {
    if (!req.payload) {
        return;
    }

    const token = req.query.token;

    res.render('auth/verify-form', { token, title: 'otp confirm', auth_path: '/verify-otp', label: 'ワンタイムパスワード', input_name: 'otp', });
});

router.post('/verify-otp', requireNonLogin, authenticateJWT, async (req: Request, res: Response): Promise<void> => {
    if (!req.payload) {
        return;
    }

    const { otp } = req.body;

    try {
        const isValid = await knex('users').where({ id: req.payload.id, name: req.payload.name, otp }).first();
        if (!isValid) {
            res.status(400).send('Invalid OTP');
            return;
        }

        await knex('users').where({ id: req.payload.id, name: req.payload.name, otp }).update({ otp: null });

        const user = await knex('users').where({ id: req.payload.id, name: req.payload.name }).first();
        req.login(user, (err) => {
            if (err) {
                res.status(500).send('Error logging in');
                return;
            }

            res.redirect(basepath.successurl);
        });
    } catch (error) {
        res.status(500).send('Error verifying OTP.');
    }
});

router.get('/discord', requireNonLogin, passport.authenticate('discord'));

router.get('/discord/callback', requireNonLogin, passport.authenticate('discord', {
    failureRedirect: `${basepath.rootpath}/signin`,
    successRedirect: basepath.successurl,
}));

router.get('/google', requireNonLogin, passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', requireNonLogin, passport.authenticate('google', {
    failureRedirect: `${basepath.rootpath}/signin`,
    successRedirect: basepath.successurl,
}));

router.get('/x', requireNonLogin, passport.authenticate('x'));

router.get('/x/callback', requireNonLogin, passport.authenticate('x', {
    failureRedirect: `${basepath.rootpath}/signin`,
    successRedirect: basepath.successurl,
}));

export default router;
