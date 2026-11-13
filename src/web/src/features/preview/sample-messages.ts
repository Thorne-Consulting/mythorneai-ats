// Sample data for the Messages inbox preview. Every person, email and phone number here is
// fictional (names from the Figma frames). Replace with a query when candidate messaging exists.

export type ChatMessage = {
  id: string;
  direction: 'in' | 'out';
  body: string;
  time: string;
  delivered?: boolean;
  /** Names and sizes only: preview attachments never leave the browser. */
  attachments?: { name: string; size: number }[];
  /** Local date-time; the message shows as scheduled until then. */
  scheduledFor?: string;
};

export type Conversation = {
  id: string;
  name: string;
  role: string;
  stage: string;
  email: string;
  phone: string;
  location: string;
  /** Shown in the inbox row ("9:42 AM", "Oct 13"). */
  time: string;
  day: string;
  unread: boolean;
  starred: boolean;
  archived: boolean;
  nextInterview?: { title: string; when: string };
  messages: ChatMessage[];
};

export const sampleConversations: Conversation[] = [
  {
    id: 'c1',
    name: 'Karen Dela Cruz',
    role: 'Software Engineer',
    stage: 'Interview',
    email: 'karen.delacruz@example.com',
    phone: '+63 917 555 0142',
    location: 'Manila, Philippines',
    time: '9:42 AM',
    day: 'Today, October 15, 2026',
    unread: false,
    starred: true,
    archived: false,
    nextInterview: { title: 'Technical interview', when: 'Fri, Oct 16 · 10:00–11:00 AM' },
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Hi Karen, thanks for completing the Software Engineering assessment. You scored 92 / 100.',
        time: '9:30 AM',
        delivered: true,
      },
      {
        id: 'm2',
        direction: 'in',
        body: 'That is great to hear, thank you for letting me know.',
        time: '9:35 AM',
      },
      {
        id: 'm3',
        direction: 'out',
        body: 'We would love to schedule your technical interview for Friday at 10 AM. Does that work for you?',
        time: '9:38 AM',
        delivered: true,
      },
      { id: 'm4', direction: 'in', body: 'Thank you! Looking forward to it.', time: '9:42 AM' },
    ],
  },
  {
    id: 'c2',
    name: 'Jayl Remando',
    role: 'Marketing Specialist',
    stage: 'Screening',
    email: 'jayl.remando@example.com',
    phone: '+63 918 555 0187',
    location: 'Cebu City, Philippines',
    time: 'Oct 13',
    day: 'Tuesday, October 13, 2026',
    unread: true,
    starred: false,
    archived: false,
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Hi Jayl, could you share a few campaigns you have led in the last year?',
        time: '2:10 PM',
        delivered: true,
      },
      {
        id: 'm2',
        direction: 'in',
        body: 'Happy to share more details. I will send a short deck tonight.',
        time: '4:05 PM',
      },
    ],
  },
  {
    id: 'c3',
    name: 'Carl Rabanero',
    role: 'Backend Engineer',
    stage: 'Offer',
    email: 'carl.rabanero@example.com',
    phone: '+63 919 555 0120',
    location: 'Quezon City, Philippines',
    time: 'Oct 12',
    day: 'Monday, October 12, 2026',
    unread: true,
    starred: false,
    archived: false,
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Hi Carl, the offer letter is in your inbox. Let us know if you have any questions.',
        time: '11:00 AM',
        delivered: true,
      },
      {
        id: 'm2',
        direction: 'in',
        body: 'Received, thank you. Could we talk about the start date?',
        time: '1:24 PM',
      },
    ],
  },
  {
    id: 'c4',
    name: 'Nicole Reyes',
    role: 'Product Designer',
    stage: 'Phone screen',
    email: 'nicole.reyes@example.com',
    phone: '+63 920 555 0163',
    location: 'Davao City, Philippines',
    time: 'Oct 10',
    day: 'Saturday, October 10, 2026',
    unread: true,
    starred: false,
    archived: false,
    nextInterview: { title: 'Phone screen', when: 'Mon, Oct 19 · 9:00–9:30 AM' },
    messages: [
      {
        id: 'm1',
        direction: 'in',
        body: 'Is the design challenge done at home or on site?',
        time: '8:15 PM',
      },
    ],
  },
  {
    id: 'c5',
    name: 'Sofia Ramos',
    role: 'Data Analyst',
    stage: 'Hired',
    email: 'sofia.ramos@example.com',
    phone: '+63 921 555 0101',
    location: 'Makati, Philippines',
    time: 'Sep 28',
    day: 'Monday, September 28, 2026',
    unread: false,
    starred: false,
    archived: true,
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Welcome aboard, Sofia. Your onboarding pack is on its way.',
        time: '10:00 AM',
        delivered: true,
      },
      {
        id: 'm2',
        direction: 'in',
        body: 'Thank you so much, see you on Monday.',
        time: '10:20 AM',
      },
    ],
  },
  {
    id: 'c6',
    name: 'Paolo Mendoza',
    role: 'Marketing Specialist',
    stage: 'Assessment',
    email: 'paolo.mendoza@example.com',
    phone: '+63 922 555 0175',
    location: 'Pasig, Philippines',
    time: 'Oct 9',
    day: 'Friday, October 9, 2026',
    unread: false,
    starred: true,
    archived: false,
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Hi Paolo, your Marketing Strategy assessment link is ready. It takes about 40 minutes.',
        time: '3:00 PM',
        delivered: true,
      },
    ],
  },
  {
    id: 'c7',
    name: 'Andrea Santos',
    role: 'Product Manager',
    stage: 'Final interview',
    email: 'andrea.santos@example.com',
    phone: '+63 923 555 0110',
    location: 'Taguig, Philippines',
    time: 'Oct 8',
    day: 'Thursday, October 8, 2026',
    unread: true,
    starred: false,
    archived: false,
    nextInterview: { title: 'Final interview', when: 'Tue, Oct 20 · 2:00–3:00 PM' },
    messages: [
      {
        id: 'm1',
        direction: 'in',
        body: 'Could you tell me who I will be meeting in the final round?',
        time: '9:12 AM',
      },
    ],
  },
  {
    id: 'c8',
    name: 'Third Villamor',
    role: 'Data Analyst',
    stage: 'Assessment',
    email: 'third.villamor@example.com',
    phone: '+63 924 555 0133',
    location: 'Iloilo City, Philippines',
    time: 'Oct 7',
    day: 'Wednesday, October 7, 2026',
    unread: false,
    starred: false,
    archived: false,
    messages: [
      {
        id: 'm1',
        direction: 'in',
        body: 'I had a power cut halfway through the Data Analytics assessment. Can I retake it?',
        time: '6:40 PM',
      },
      {
        id: 'm2',
        direction: 'out',
        body: 'Sorry to hear that, Third. I have reset your attempt; the same link works again.',
        time: '7:05 PM',
        delivered: true,
      },
    ],
  },
  {
    id: 'c9',
    name: 'Kleish Mendiola',
    role: 'Product Manager',
    stage: 'Applied',
    email: 'kleish.mendiola@example.com',
    phone: '+63 925 555 0198',
    location: 'Baguio, Philippines',
    time: 'Oct 5',
    day: 'Monday, October 5, 2026',
    unread: false,
    starred: false,
    archived: true,
    messages: [
      {
        id: 'm1',
        direction: 'out',
        body: 'Thanks for applying, Kleish. We will be in touch within a week.',
        time: '10:30 AM',
        delivered: true,
      },
    ],
  },
];

export type MessageTemplate = {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  /** Local date-time of the last edit. */
  updatedAt: string;
};

export const templateCategories = ['Scheduling', 'Assessments', 'Offers', 'Rejections', 'General'];

export const sampleTemplates: MessageTemplate[] = [
  {
    id: 't1',
    name: 'Interview invitation',
    category: 'Scheduling',
    subject: 'Interview for {{job_title}} at {{company}}',
    body: 'Hi {{first_name}},\n\nThanks for your interest in the {{job_title}} role. We would like to invite you to an interview on {{interview_time}}.\n\nReply to this message if the time does not work and we will find another.\n\nBest,\n{{sender_name}}',
    updatedAt: '2026-10-12T10:00',
  },
  {
    id: 't2',
    name: 'Assessment link',
    category: 'Assessments',
    subject: 'Your {{company}} assessment',
    body: 'Hi {{first_name}},\n\nThe next step for the {{job_title}} role is a short assessment. You can take it any time in the next 7 days; it saves as you go.\n\nGood luck,\n{{sender_name}}',
    updatedAt: '2026-10-08T15:30',
  },
  {
    id: 't3',
    name: 'Interview reminder',
    category: 'Scheduling',
    subject: 'Reminder: your interview on {{interview_time}}',
    body: 'Hi {{first_name}}, a quick reminder of your interview on {{interview_time}}. See you then.\n\n{{sender_name}}',
    updatedAt: '2026-09-30T09:15',
  },
  {
    id: 't4',
    name: 'Offer follow-up',
    category: 'Offers',
    subject: 'Your offer for {{job_title}}',
    body: 'Hi {{first_name}},\n\nJust checking you received the offer letter for {{job_title}}. Happy to talk through any questions about it.\n\n{{sender_name}}',
    updatedAt: '2026-09-21T14:00',
  },
  {
    id: 't5',
    name: 'Not moving forward',
    category: 'Rejections',
    subject: 'Your application for {{job_title}}',
    body: 'Hi {{first_name}},\n\nThank you for the time you put into the {{job_title}} process. We have decided not to move forward at this stage. We will keep your details and reach out if a better fit opens up.\n\nKind regards,\n{{sender_name}}',
    updatedAt: '2026-09-02T11:45',
  },
  {
    id: 't6',
    name: 'Quick check-in',
    category: 'General',
    subject: 'Checking in',
    body: 'Hi {{first_name}}, just checking in on how things are going on your side. Anything you need from us?\n\n{{sender_name}}',
    updatedAt: '2026-08-18T16:20',
  },
];
