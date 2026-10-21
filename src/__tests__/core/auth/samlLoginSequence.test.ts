import { describe, expect, test } from 'bun:test';

import { runLoginSequence, MFA_HINT_MESSAGE, type PageDriver, type LoginSequenceOptions } from '../../../core/auth/saml/loginSequence';

const SAP_HOST = 'sap.example.com:44300';
const IDP_HOST = 'idp.example.com';
const MFA_HOST = 'mfa.example.com';

const SELECTORS = { username: '#username', password: '#password', submit: '#signOn' };

// Fast timeouts so the suite runs in well under a second
const TIMEOUTS = {
    FORM_SELECTOR: 200,
    PASSWORD_STEP: 200,
    PRE_SUBMIT_IDLE: 10,
    LOGIN_COMPLETE: 400,
    MFA_HINT: 60,
    POST_LOGIN_IDLE: 10,
    MANUAL_COMPLETE: 400,
    POLL: 10,
};

interface FakePage {
    host: string;
    hasUsername: boolean;
    hasPassword: boolean;
    message: string;
    text?: string;
}

// Simulates a browser page: the scripted onSubmit mutates the page in response
// to each click, and the driver answers the sequence's expressions from state
class FakeDriver implements PageDriver {
    page: FakePage;
    navigations = 0;
    submits = 0;
    filled: Record<string, string> = {};
    private onSubmit: (driver: FakeDriver) => void;

    constructor(page: FakePage, onSubmit: (driver: FakeDriver) => void) {
        this.page = page;
        this.onSubmit = onSubmit;
    }

    navigateTo(page: FakePage): void {
        this.page = page;
        this.navigations += 1;
    }

    async evaluate<T>(expression: string): Promise<T | null> {
        if (expression === 'location.host') return this.page.host as T;
        if (expression.includes('location.host')) {
            return { host: this.page.host, hasPassword: this.page.hasPassword, message: this.page.message, text: this.page.text ?? '' } as T;
        }
        if (expression.includes('location.href')) return `https://${this.page.host}/ ("Fake")` as T;
        if (expression.includes('el.click()')) {
            this.submits += 1;
            this.onSubmit(this);
            return true as T;
        }
        if (expression.includes('el.value =')) {
            const selector = expression.includes(SELECTORS.username) ? SELECTORS.username : SELECTORS.password;
            const present = selector === SELECTORS.username ? this.page.hasUsername : this.page.hasPassword;
            if (present) this.filled[selector] = expression;
            return present as T;
        }
        if (expression.startsWith('!!document.querySelector')) {
            return (expression.includes(SELECTORS.username) ? this.page.hasUsername : this.page.hasPassword) as T;
        }
        return null;
    }

    async waitForIdle(): Promise<void> {}

    topNavigations(): number {
        return this.navigations;
    }
}

const loginPage = (message = ''): FakePage => ({ host: IDP_HOST, hasUsername: true, hasPassword: true, message });
const sapPage: FakePage = { host: SAP_HOST, hasUsername: false, hasPassword: false, message: '' };
const mfaPage: FakePage = { host: MFA_HOST, hasUsername: false, hasPassword: false, message: '' };

function options(overrides: Partial<LoginSequenceOptions> = {}): LoginSequenceOptions {
    return {
        sapHost: SAP_HOST,
        credentials: { username: 'user@example.com', password: 'secret' },
        formSelectors: SELECTORS,
        timeouts: TIMEOUTS,
        ...overrides,
    };
}

describe('runLoginSequence', () => {
    test('succeeds once the browser returns to the SAP host', async () => {
        const driver = new FakeDriver(loginPage(), (d) => d.navigateTo(sapPage));

        const [, error] = await runLoginSequence(driver, options());

        expect(error).toBeNull();
        expect(driver.submits).toBe(1);
        expect(driver.filled[SELECTORS.password]).toContain('"secret"');
    });

    test('waits through a multi-factor step, reporting the hint once and the page text', async () => {
        const statuses: string[] = [];
        const driver = new FakeDriver(loginPage(), (d) => {
            d.navigateTo({ ...mfaPage, text: 'Select 42 on your device' });
            setTimeout(() => d.navigateTo(sapPage), TIMEOUTS.MFA_HINT * 3);
        });

        const [, error] = await runLoginSequence(driver, options({ onStatus: (m) => statuses.push(m) }));

        expect(error).toBeNull();
        expect(statuses).toEqual([MFA_HINT_MESSAGE, 'Identity provider page: Select 42 on your device']);
    });

    test('reports the identity provider message when the form is re-rendered', async () => {
        const driver = new FakeDriver(loginPage(), (d) => d.navigateTo(loginPage('We did not recognize the username or password.')));

        const [, error] = await runLoginSequence(driver, options());

        expect(error?.message).toContain('We did not recognize the username or password.');
        expect(error?.message).toContain('Check the username and password');
        expect(driver.submits).toBe(1);
    });

    test('retries once when the form is re-rendered without a message', async () => {
        const driver = new FakeDriver(loginPage(), (d) => {
            if (d.submits === 1) d.navigateTo(loginPage());
            else d.navigateTo(sapPage);
        });

        const [, error] = await runLoginSequence(driver, options());

        expect(error).toBeNull();
        expect(driver.submits).toBe(2);
    });

    test('gives up after two silent re-renders', async () => {
        const driver = new FakeDriver(loginPage(), (d) => d.navigateTo(loginPage()));

        const [, error] = await runLoginSequence(driver, options());

        expect(error?.message).toContain('re-displayed the sign-on form');
        expect(driver.submits).toBe(2);
    });

    test('times out when the browser never returns to SAP', async () => {
        const driver = new FakeDriver(loginPage(), (d) => d.navigateTo(mfaPage));

        const [, error] = await runLoginSequence(driver, options());

        expect(error?.message).toContain(`did not return to ${SAP_HOST}`);
        expect(error?.message).toContain(MFA_HOST);
    });

    test('handles two-step pages where the password appears after the username', async () => {
        const usernameOnly: FakePage = { host: IDP_HOST, hasUsername: true, hasPassword: false, message: '' };
        const driver = new FakeDriver(usernameOnly, (d) => {
            if (d.submits === 1) d.navigateTo({ host: IDP_HOST, hasUsername: false, hasPassword: true, message: '' });
            else d.navigateTo(sapPage);
        });

        const [, error] = await runLoginSequence(driver, options());

        expect(error).toBeNull();
        expect(driver.submits).toBe(2);
    });

    test('fails when the sign-on form never appears', async () => {
        const driver = new FakeDriver({ host: SAP_HOST, hasUsername: false, hasPassword: false, message: '' }, () => {});

        const [, error] = await runLoginSequence(driver, options());

        expect(error?.message).toContain('Login form not found');
    });

    describe('interactive (visible browser)', () => {
        test('hands over to the user when automation fails and succeeds once SAP is reached', async () => {
            const statuses: string[] = [];
            // Automated submit is rejected with an error; the "user" then signs in by hand
            const driver = new FakeDriver(loginPage(), (d) => {
                d.navigateTo(loginPage('Wrong password'));
                setTimeout(() => d.navigateTo(sapPage), TIMEOUTS.MFA_HINT);
            });

            const [, error] = await runLoginSequence(driver, options({ interactive: true, onStatus: (m) => statuses.push(m) }));

            expect(error).toBeNull();
            expect(statuses).toHaveLength(1);
            expect(statuses[0]).toContain('Automatic sign-in did not complete');
            expect(statuses[0]).toContain('Wrong password');
        });

        test('reports both failures when the user never completes the sign-in', async () => {
            const driver = new FakeDriver(loginPage(), (d) => d.navigateTo(loginPage('Wrong password')));

            const [, error] = await runLoginSequence(driver, options({ interactive: true }));

            expect(error?.message).toContain('was not completed in the browser window');
            expect(error?.message).toContain('Wrong password');
        });
    });
});
