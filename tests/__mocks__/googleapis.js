// tests/__mocks__/googleapis.js - Mock for Google APIs
const mockUsers = {
  messages: {
    send: jest.fn().mockResolvedValue({
      data: {
        id: 'mock_message_id',
        threadId: 'mock_thread_id',
      },
    }),
    get: jest.fn().mockResolvedValue({
      data: {
        id: 'mock_message_id',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Email' },
            { name: 'From', value: 'test@tuifly.com' },
          ],
        },
      },
    }),
  },
};

const mockOAuth2 = {
  setCredentials: jest.fn(),
  getAccessToken: jest.fn().mockResolvedValue({
    token: 'mock_access_token',
  }),
  refreshAccessToken: jest.fn().mockResolvedValue({
    credentials: {
      access_token: 'mock_refresh_token',
      expiry_date: Date.now() + 3600000,
    },
  }),
};

const mockGmail = jest.fn().mockReturnValue({
  users: mockUsers,
});

const mockAuth = {
  OAuth2: jest.fn().mockImplementation(() => mockOAuth2),
};

const mockGoogle = {
  gmail: mockGmail,
  auth: mockAuth,
};

module.exports = {
  google: mockGoogle,

  // Helper methods for tests
  __getMockUsers: () => mockUsers,
  __getMockOAuth2: () => mockOAuth2,
  __resetMocks: () => {
    Object.values(mockUsers.messages).forEach(mock => mock.mockClear());
    Object.values(mockOAuth2).forEach(
      mock => typeof mock.mockClear === 'function' && mock.mockClear()
    );
  },
};
