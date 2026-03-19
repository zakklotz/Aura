export type MainTabParamList = {
  Messages: undefined;
  Dialer: undefined;
  Contacts: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  ThreadDetail: { threadId: string; title: string };
  Mailbox: undefined;
  ContactCard: { contactId: string };
  Onboarding: undefined;
  ActiveCall: undefined;
  SignIn: undefined;
};
