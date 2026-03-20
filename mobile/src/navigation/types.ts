export type MainTabParamList = {
  Inbox: undefined;
  Phone: undefined;
  Contacts: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  ThreadDetail: { threadId: string; title: string };
  Mailbox: undefined;
  ContactCard:
    | {
        contactId?: string | null;
        initialPhoneNumber?: string | null;
        initialName?: string | null;
      }
    | undefined;
  Onboarding: undefined;
  ActiveCall: undefined;
  SignIn: undefined;
};
