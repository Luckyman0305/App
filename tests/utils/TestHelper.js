import _ from 'underscore';
import Onyx from 'react-native-onyx';
import Str from 'expensify-common/lib/str';
import CONST from '../../src/CONST';
import * as Session from '../../src/libs/actions/Session';
import HttpUtils from '../../src/libs/HttpUtils';
import ONYXKEYS from '../../src/ONYXKEYS';
import waitForPromisesToResolve from './waitForPromisesToResolve';
import * as NumberUtils from '../../src/libs/NumberUtils';

/**
 * @param {String} login
 * @param {Number} accountID
 * @param {String} [firstName]
 * @returns {Object}
 */
function buildPersonalDetails(login, accountID, firstName = 'Test') {
    return {
        accountID,
        login,
        avatar: 'https://d2k5nsl2zxldvw.cloudfront.net/images/avatars/avatar_7.png',
        avatarThumbnail: 'https://d2k5nsl2zxldvw.cloudfront.net/images/avatars/avatar_7.png',
        displayName: `${firstName} User`,
        firstName,
        lastName: 'User',
        pronouns: '',
        timezone: CONST.DEFAULT_TIME_ZONE,
        payPalMeAddress: '',
        phoneNumber: '',
    };
}

/**
 * Simulate signing in and make sure all API calls in this flow succeed. Every time we add
 * a mockImplementationOnce() we are altering what Network.post() will return.
 *
 * @param {Number} [accountID]
 * @param {String} [login]
 * @param {String} [password]
 * @param {String} [authToken]
 * @param {String} [firstName]
 * @return {Promise}
 */
function signInWithTestUser(accountID = 1, login = 'test@user.com', password = 'Password1', authToken = 'asdfqwerty', firstName = 'Test') {
    const originalXhr = HttpUtils.xhr;
    HttpUtils.xhr = jest.fn();
    HttpUtils.xhr.mockResolvedValue({
        onyxData: [
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.CREDENTIALS,
                value: {
                    login,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.ACCOUNT,
                value: {
                    validated: true,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.PERSONAL_DETAILS_LIST,
                value: {
                    [accountID]: buildPersonalDetails(login, accountID, firstName),
                },
            },
        ],
        jsonCode: 200,
    });

    // Simulate user entering their login and populating the credentials.login
    Session.beginSignIn(login);
    return waitForPromisesToResolve()
        .then(() => {
            // Response is the same for calls to Authenticate and BeginSignIn
            HttpUtils.xhr.mockResolvedValue({
                onyxData: [
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.SESSION,
                        value: {
                            authToken,
                            accountID,
                            email: login,
                            encryptedAuthToken: authToken,
                        },
                    },
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.CREDENTIALS,
                        value: {
                            autoGeneratedLogin: Str.guid('expensify.cash-'),
                            autoGeneratedPassword: Str.guid(),
                        },
                    },
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.USER,
                        value: {
                            isUsingExpensifyCard: false,
                        },
                    },
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.BETAS,
                        value: ['all'],
                    },
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: ONYXKEYS.NVP_PRIVATE_PUSH_NOTIFICATION_ID,
                        value: 'randomID',
                    },
                ],
                jsonCode: 200,
            });
            Session.signIn(password);
            return waitForPromisesToResolve();
        })
        .then(() => {
            HttpUtils.xhr = originalXhr;
        });
}

function signOutTestUser() {
    const originalXhr = HttpUtils.xhr;
    HttpUtils.xhr = jest.fn();
    HttpUtils.xhr.mockResolvedValue({jsonCode: 200});
    Session.signOutAndRedirectToSignIn();
    return waitForPromisesToResolve().then(() => (HttpUtils.xhr = originalXhr));
}

/**
 * Use for situations where fetch() is required. This mock is stateful and has some additional methods to control its behavior:
 *
 * - pause() – stop resolving promises until you call resume()
 * - resume() - flush the queue of promises, and start resolving new promises immediately
 * - fail() - start returning a failure response
 * - success() - go back to returning a success response
 *
 * @example
 *
 *     beforeAll(() => {
 *         global.fetch = TestHelper.getGlobalFetchMock();
 *     });
 *
 * @returns {Function}
 */
function getGlobalFetchMock() {
    const queue = [];
    let isPaused = false;
    let shouldFail = false;

    const getResponse = () =>
        shouldFail
            ? {
                  ok: true,
                  json: () => Promise.resolve({jsonCode: 400}),
              }
            : {
                  ok: true,
                  json: () => Promise.resolve({jsonCode: 200}),
              };

    const mockFetch = jest.fn().mockImplementation(() => {
        if (!isPaused) {
            return Promise.resolve(getResponse());
        }
        return new Promise((resolve) => queue.push(resolve));
    });

    mockFetch.pause = () => (isPaused = true);
    mockFetch.resume = () => {
        isPaused = false;
        _.each(queue, (resolve) => resolve(getResponse()));
        return waitForPromisesToResolve();
    };
    mockFetch.fail = () => (shouldFail = true);
    mockFetch.succeed = () => (shouldFail = false);

    return mockFetch;
}

/**
 * @param {String} login
 * @param {Number} accountID
 * @returns {Promise}
 */
function setPersonalDetails(login, accountID) {
    Onyx.merge(ONYXKEYS.PERSONAL_DETAILS_LIST, {
        [accountID]: buildPersonalDetails(login, accountID),
    });
    return waitForPromisesToResolve();
}

/**
 * @param {String} created
 * @param {Number} actorAccountID
 * @param {String} actionID
 * @returns {Object}
 */
function buildTestReportComment(created, actorAccountID, actionID = null) {
    const reportActionID = actionID || NumberUtils.rand64();
    return {
        actionName: CONST.REPORT.ACTIONS.TYPE.ADDCOMMENT,
        person: [{type: 'TEXT', style: 'strong', text: 'User B'}],
        created,
        message: [{type: 'COMMENT', html: `Comment ${actionID}`, text: `Comment ${actionID}`}],
        reportActionID,
        actorAccountID,
    };
}

export {getGlobalFetchMock, signInWithTestUser, signOutTestUser, setPersonalDetails, buildPersonalDetails, buildTestReportComment};
