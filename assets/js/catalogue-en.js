/* ==========================================================================
   CAPMEDIA ACADEMY · The catalogue (English)

   Single source of truth for the courses: identities, prices, programs,
   statuses. English counterpart of catalogue.js. Consumed by:
   - the landing generator (outils/generer-landings.py)
   - the catalogue page (formations/)
   - the member area and My space
   - the checkout Cloud Function (generated copy: fonctions/catalogue.json)

   Prices in euros, VAT included. `essentiel` / `complet` per course.
   The PACK grants access to everything: `basic` = everything in Essential,
   `avance` = everything in Complete. Pack price = sum of prices, minus 30%.
   ========================================================================== */

/* eslint-disable */
const CATALOGUE = {

  formations: [
    {
      slug: 'mobile',
      acces: 'pack', ordre: 5,
      nom: 'From Zero to the App Store',
      courte: 'Build and publish your first mobile app',
      accroche: "Your mobile app live on the App Store in 30 days, even if you've never written a line of code.",
      niveau: 'Flagship course',
      duree: '30 days · 17 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      page: '/index.html',
      couleurIco: 'telephone',
      /* Program and FAQ translated from the flagship landing (index.html);
         the French catalogue entry relies on that handwritten page. */
      modules: [
        { t: "Before you start: what nobody tells you", pts: ["What it really costs, line by line (spoiler: $99 + $25)", "How long it actually takes, depending on your pace", "The one technical choice that matters, and why we make it", "Mac or PC? The honest answer, and how to publish on iPhone without a Mac", "Beginner mistake number one: aiming too big on the first try"] },
        { t: "Find the idea, and the niche to match", pts: ["The myth of the brilliant idea, and what actually matters", "The four places to look: daily irritants, your trade, one-star reviews, communities", "Why a niche beats the mass market, with the numbers", "The three tests that validate an idea in one evening", "The ideas to avoid for a first app"] },
        { t: "Set up your workshop", pts: ["The terminal, explained to someone who has never opened it", "Node, VS Code, Expo: what, why, and the click-by-click install", "Install Claude Code or Cursor and configure it to work well", "Your first project running on your phone in 15 seconds", "The rescue guide: the 6 failures that block everyone"] },
        { t: "Your test bench: simulators, emulators, real phones", pts: ["The rule: real phone first", "The iPhone simulator, and the three-step check before publishing", "The Android emulator step by step, with the virtualization traps", "The USB cable when Wi-Fi acts up: adb, USB debugging", "Which tool at which moment, in one table"] },
        { t: "Talk to the AI so it writes good code", pts: ["The request structure that gets 10x better results", 'Why "build me a fitness app" will never work', "The context file that makes the AI far better on your project", "How to unstick an AI that keeps looping on the same error", "The blind copy-paste trap, and the reflex that saves you"] },
        { t: "Understand what you read (the vital minimum)", pts: ["The 8 vocabulary words that are enough to understand everything", "The map of your files: where you work, what you never touch", "Read an error message without panicking"] },
        { t: "Git and GitHub, your safety net", pts: ["Git and GitHub: the camera and the album, explained without jargon", "Open your account, two-factor authentication, the right username", "The 12 commands that will last you for years", "The 3 famous accidents: the pushed secret, the reset, the force push", "Private repository, always, and why"] },
        { t: "Mock up your app before you build it", pts: ["One hour of sketching saves a week of code", "Paper, Excalidraw, Figma: which one and when", "Learn from real apps rather than image galleries", "The AI-generated mockup, built from your decisions", "The five rules of a useful mockup, including the empty screen"] },
        { t: "Build the screens of Rituel", pts: ["The daily list, the detail screen, the settings", "The bottom navigation bar, like in real apps", "Add, check off, delete: bring the app to life", "The iOS gestures people expect", "The timezone trap that files your data under the wrong day"] },
        { t: "Save the data, then sync it", pts: ["Keep data on the phone: the simplest option, and often enough", "The bug that wipes every user's data, and how to prevent it", "Move to the cloud with Firebase, for free, with no server to manage", "Security rules, explained line by line", "The surprise 400 € bill: how to make sure it never arrives"] },
        { t: 'The design that says "paid app"', pts: ["The 6 mechanical rules that separate amateur from pro", "Choose a typeface, a color, a rhythm: without being a designer", "Dark mode in one evening, and why it isn't just light mode inverted", "The 3 animations that make an app feel expensive", "Make your icon and your splash screen"] },
        { t: "The notifications that bring people back", pts: ["Local reminders: the 8 pm nudge, no server needed", "The right moment to ask for permission: 30% versus 70% acceptance", "The 4 traps that make you think your code is wrong", "Timezones, and the reminder that fires at 3 am in late October"] },
        { t: "Charge for it: subscriptions and in-app purchases", pts: ["Paid, free, freemium, subscription: which one for your idea", "Where to draw the free line: the most important decision", "Plug in RevenueCat in one evening, with the exact order of steps", "The 7-day free trial: the exact tab where it's configured", "The paywall that converts: structure, words, price", "What Apple really takes, and the 15% nobody claims"] },
        { t: "Xcode, the full tour without jargon", pts: ["The only four uses you need with Expo", "The interface, piece by piece, without getting lost", "Code signing explained once and for all", "Plug in a real iPhone and read a crash", "When you should absolutely not touch Xcode"] },
        { t: "Publish on the App Store: the module worth the whole course", pts: ["Open your Apple developer account without getting turned away", "Certificates and profiles: explained once and for all", "Build your app in the cloud, without a Mac, with EAS", "TestFlight: get your app tested before everyone else", "The privacy questionnaire, checkbox by checkbox", "Your screenshots in 20 minutes, without Photoshop", "The 11 rejection reasons: and the exact reply to write"] },
        { t: "Publish on Google Play", pts: ["The $25 account, paid once for life", "The 12 testers for 14 days rule: how to satisfy it", "The signing key: the point of no return to back up", "The differences from Apple that trap everyone"] },
        { t: "Your first 100 users", pts: ["App Store optimization: the title, the subtitle, the 100 characters", "Why your app won't sell itself, and what works", "The short-video format that brings free installs", "The only 3 metrics to watch, and all the ones to ignore", "The update rhythm that makes an app climb"] },
      ],
      faq: [
        { q: "I'm a true beginner. Like, really.", r: "That's exactly who this course is for. Module 1 explains what the terminal is and where to click, screenshot by screenshot. If you can install an app on your computer and follow instructions in order, you have the level required." },
        { q: "Do I need a Mac?", r: "No. We build the app in the cloud with EAS, so you can publish on the App Store from a Windows PC. You will need an iPhone or an Android phone for testing: your own is enough." },
        { q: "How much time per week?", r: "Plan on 3 to 5 hours a week to finish in a month. Some go faster, others take three months. Access is lifetime, there's no clock ticking." },
        { q: "Is this no-code?", r: "No, and that's deliberate. No-code locks you in: you pay a subscription forever, you don't own your app, and many platforms make native publishing painful. Here you produce real code that you own: the AI simply writes it under your direction." },
        { q: "Which technology exactly?", r: "React Native with Expo. One codebase for iPhone and Android. It's what Discord, Shopify and Coinbase use. It's also what AI models handle best, which is no small detail when they're the ones writing." },
        { q: "Are there videos?", r: "The course is written, with annotated screenshots and copy-ready code. That's a choice: you read faster than you listen, you can copy-paste from text, and a page gets updated when Apple changes its interface: a video doesn't. The passages where video genuinely helps are filmed." },
        { q: "What if Apple rejects my app?", r: "It happens, even to professionals. Module 9 lists the 11 most frequent rejection reasons with, for each one, the fix to make and the exact message to send the reviewer. A rejection isn't the end, it's a round trip." },
        { q: "What does it cost on top of the course?", r: "$99 a year for the Apple developer account, $25 one time for Google Play. Everything else we use has a free tier that's more than enough. If you only target Android, your total is $25." },
        { q: "Can I pay in installments?", r: "Yes, in 3 interest-free payments: the option appears at checkout if your bank supports it." },
        { q: "How does the review of my app work?", r: "It's included in the Complete tier. When your app is ready to submit, you add me as a tester on TestFlight or the Google Play closed beta: the address is in your member area. I install it on a real phone, test it the way a reviewer would, and you get written feedback within 7 business days: the rejection reasons I spot, what breaks on small screens or in dark mode, and the three things to fix first. One app, one pass, no deadline. I can't guarantee Apple will accept it: I tell you what will get flagged before they do." },
        { q: "Will I make money?", r: "I don't know, and be wary of anyone who answers otherwise. What I can guarantee is a published app and the skill to do it again. The \"Let's talk money\" section gives you the real math, with no sugarcoating." },
      ],
    },

    {
      slug: 'github',
      acces: 'gratuit', ordre: 1,
      nom: 'Git & GitHub: Complete Mastery',
      courte: 'The safety net for all your digital work',
      accroche: "Never lose an hour of work again. Version, back up, collaborate, and turn your GitHub into a professional showcase.",
      niveau: 'Fast-track course',
      duree: '1 week · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'cadenas',
      probleme: [
        "You've lost work before. An overwritten file, a deleted folder, an \"it worked yesterday\" you could never get back. And you know it will happen again.",
        "Git has been solving this problem for twenty years, but every tutorial explains it for engineers, with fifty commands you'll never need and jargon by the second sentence.",
        "This course takes the opposite path: the 12 commands that actually matter, the 3 accidents that cost real money, and GitHub as a showcase worth more than a resume.",
      ],
      publics: [
        "You write code (or have AI write it) and you have no safety net",
        "You took the mobile course and want to go beyond module 6",
        "You want a GitHub profile that proves what you can do",
        'You work with others and the "final_v3_REAL.zip" files are wearing you out',
      ],
      modules: [
        { t: "What Git actually does (and why everyone uses it)", pts: ["The camera and the album, no jargon", "Install and introduce yourself, Mac and Windows", "Your first repository in 10 minutes"] },
        { t: "The daily cycle: add, commit, push", pts: ["The right rhythm of snapshots", "Messages that still make sense in 6 months", "The .gitignore that protects you"] },
        { t: "Go back in time without breaking anything", pts: ["checkout, restore, stash: which one when", "Read the history like a journal", "reset --hard: when, and above all when not"] },
        { t: "Branches, your sandbox", pts: ["Experiment without risk", "Merge cleanly", "Resolve a conflict without panicking"] },
        { t: "GitHub: account, security, repositories", pts: ["The username that looks professional", "Two-factor authentication and keys", "Private or public: the simple rule"] },
        { t: "Collaborate: issues, pull requests, reviews", pts: ["Propose a change cleanly", "Review other people's work", "The conventions that prevent friction"] },
        { t: "Your showcase: the profile worth a resume", pts: ["The profile README", "Pin the right projects", "What a recruiter or a client looks at"] },
        { t: "The 3 famous accidents and their firefighters", pts: ["The pushed secret: the full procedure", "The force push: repairing it", "Rewritten history: recovering it"] },
      ],
      faq: [
        { q: "I did module 6 of the mobile course, is this redundant?", r: "Module 6 gives you the survival kit in 18 minutes. Here you get mastery: branches, collaboration, pull requests, a professional showcase, and recovery after an accident. It's the natural continuation." },
        { q: "Do I need to know how to code?", r: "No. Git versions any kind of file. If you write, if you configure, if you have AI generate code, it works for you." },
        { q: "How long does it take?", r: "One week at one hour a day, and the reflex is installed for life." },
      ],
    },

    {
      slug: 'claude-code',
      acces: 'gratuit', ordre: 3,
      nom: 'Claude Code: The Developer in Your Terminal',
      courte: "Get professional-grade output from AI",
      accroche: "The tool professional developers use to delegate code. Setup, method, guardrails: everything that separates the toy from the production tool.",
      niveau: 'Advanced course',
      duree: '2 weeks · 10 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      couleurIco: 'ia',
      probleme: [
        "You've tried getting an AI to code in the browser: it works for five minutes, then it forgets your project, invents files, and has you copy-pasting fifty times an hour.",
        "Claude Code is a different category: it lives in your terminal, sees your real files, edits them, runs your tests, fixes, tries again. It's a tireless junior developer, provided you know how to direct it.",
        "This course teaches you to direct it: clean installation, context file, permissions, subagents, hooks, and the working method that produces reliable code instead of mush.",
      ],
      publics: [
        "You've tasted vibe coding and want to go professional",
        "You're building a product and browser AI is wasting your time",
        "You're a developer and want to multiply your output without sacrificing quality",
        "You finished the mobile course and want to industrialize your method",
      ],
      modules: [
        { t: "Install and connect Claude Code cleanly", pts: ["Terminal, VS Code, app: the three forms", "Authentication and plans", "Your first guided project"] },
        { t: "CLAUDE.md: your project's memory", pts: ["What to put in it (and what to leave out)", "The rules that change everything", "Project memory and global memory"] },
        { t: "Permissions and security", pts: ["What the tool can touch, and how to limit it", "The execution modes", "Work without fear of accidents"] },
        { t: "The method: small step, test, commit", pts: ["Break a feature into safe requests", "Have the tests written first", "The cycle that produces reliable code"] },
        { t: "Direct, review, refuse", pts: ["Read a diff like a project lead", "Spot suspicious code without being an expert", "Ask for a redo without losing your temper"] },
        { t: "Subagents and parallel tasks", pts: ["Delegate the research, keep the decision", "Explore an unknown codebase", "Automated code reviews"] },
        { t: "Hooks, commands and customization", pts: ["Automate checks at every step", "Your own custom commands", "Plug in your tools"] },
        { t: "Git + Claude Code: the production duo", pts: ["Delegated commits, branches and pull requests", "The review before merging", "A history that stays clean"] },
        { t: "The traps that cost real money", pts: ["Rotten context and how to start fresh", "Dependency hallucinations", "The bill: understand and control your costs"] },
        { t: "Capstone project: a real feature from A to Z", pts: ["From ticket to production", "Without writing a line yourself", "With senior-level quality"] },
      ],
      faq: [
        { q: "Do I already need to know how to code?", r: "No, but you have to be willing to learn to read code. The course teaches you to direct and to review, not to write." },
        { q: "Is it expensive to run?", r: "An entire module is devoted to costs: understanding the billing, choosing your plan, and the habits that divide your consumption by three." },
        { q: "Why Claude Code and not another tool?", r: "Because it's the most capable terminal tool on the market, and the one the author uses in production every day. The method carries over to its competitors." },
      ],
    },

    {
      slug: 'site-web-ia',
      acces: 'solo', prix: 97, prixBarre: 247,
      nom: "Your Professional Website, Built with AI",
      courte: 'A real site online, fast, with no agency and no subscription',
      accroche: "A professional website, live on your own domain, built with AI and hosted for free. No WordPress, no 3,000 € agency, no monthly subscription.",
      niveau: 'Fast-track course',
      duree: '1 week · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'ordinateur',
      probleme: [
        "A brochure site billed 1,500 to 5,000 € by an agency, or a 200 €/year Wix subscription for a result that smells like a template: those are the two options everyone thinks they have.",
        "There is a third: describe your site to the AI, let it produce a custom, fast, clean site, and host it for free. The very site you're reading was built exactly this way.",
        "The course covers everything: the structure that sells, the design, the domain, free hosting, the contact form, and local search visibility.",
      ],
      publics: [
        "Tradesperson, freelancer, therapist, nonprofit: you need a credible website",
        "You pay for a site-builder subscription and want out",
        "You want to sell websites to your clients as a freelancer",
        "You want your project's landing page without depending on anyone",
      ],
      modules: [
        { t: "What a good brochure site must do (and nothing else)", pts: ["The 5 sections that matter", "The mistakes that make visitors flee", "Your content before your design"] },
        { t: "Generate the site with AI", pts: ["The complete structure prompt", "Iterate section by section", "Walk away with clean, lightweight code"] },
        { t: "Design without being a designer", pts: ["Type, color, spacing: the mechanical rules", "Dark mode", "The photos that look genuine"] },
        { t: "Online for free", pts: ["GitHub Pages step by step", "Your domain name connected", "Automatic HTTPS"] },
        { t: "The contact form without a server", pts: ["Three free solutions compared", "Anti-spam", "The notification that actually arrives"] },
        { t: "Get found: local SEO", pts: ["Google Business and your site", "The pages that rank", "Speed and mobile"] },
        { t: "Deliver and invoice (for freelancers)", pts: ["The 5-day client process", "What to charge, and how much", "Maintenance without servitude"] },
      ],
      faq: [
        { q: "Is this the same subject as the mobile course?", r: "No. This is the web: brochure sites, landing pages, portfolios. The skills complement each other; the AI tool is the same." },
        { q: "Are there hidden costs?", r: "The domain, about 10 € a year. Hosting is free. That's all, and you can verify it." },
      ],
    },

    {
      slug: 'automatiser-ia',
      acces: 'solo', prix: 147, prixBarre: 397,
      nom: "Automate Your Business with AI",
      courte: 'Your repetitive tasks on autopilot',
      accroche: "Invoices, follow-ups, email triage, social media, reports: plug AI into your repetitive tasks and win back hours every week.",
      niveau: 'Advanced course',
      duree: '2 weeks · 9 modules + 2 bonus',
      statut: 'disponible',
      prixE: 97,  prixEBarre: 197,
      prixC: 197, prixCBarre: 397,
      couleurIco: 'engrenage',
      probleme: [
        "Do the math: how many hours a week copy-pasting between tools, chasing clients, sorting messages, filling in spreadsheets? For most independents, it adds up to a full day.",
        "Automation tools have existed for years, but AI has changed their nature: they can now read, decide and write. An incoming invoice can be read, filed, recorded and confirmed without you.",
        "This course builds your automations one by one, on real cases, with the guardrails that keep things from going off the rails while you sleep.",
      ],
      publics: [
        "A freelancer or small team drowning in admin",
        "You want to offer automation as a service to your clients",
        "You have a product and support is eating your days",
        'You want to know what "AI agent" actually means in practice',
      ],
      modules: [
        { t: "The map of your lost hours", pts: ["The 30-minute audit", "What to automate, what never to", "The profitability math"] },
        { t: "The tools: n8n, Make, and when to code", pts: ["An honest comparison, real costs", "Our choice and why", "Installation and your first scenario"] },
        { t: "Plug AI into the middle", pts: ["Read, classify, decide, write", "Reliable automation prompts", "Temperature zero and strict formats"] },
        { t: "Case 1: the inbox that sorts itself", pts: ["Triage, labels, draft replies", "Escalating to a human", "The trust boundaries"] },
        { t: "Case 2: invoices and follow-ups", pts: ["From received invoice to updated spreadsheet", "The polite reminders that send themselves", "Bookkeeping that prepares itself"] },
        { t: "Case 3: content that publishes itself", pts: ["From draft to scheduled post", "Recycle without duplicating", "Keep your voice"] },
        { t: "Case 4: augmented customer support", pts: ["Prepared replies, never sent unsupervised", "The living knowledge base", "Measuring quality"] },
        { t: "The guardrails", pts: ["What AI must never do on its own", "Logs, alerts, kill switches", "GDPR and customer data"] },
        { t: "Selling automation (for freelancers)", pts: ["The billed audit", "The monthly retainer", "The contracts that protect you"] },
      ],
      faq: [
        { q: "Do I need to know how to code?", r: "No. The tools are visual. When a bit of code helps, the AI writes it and the course shows you where to paste it." },
        { q: "What monthly budget for the tools?", r: "From 0 to 30 € a month depending on volume. Module 2 details the real costs, no surprises." },
      ],
    },

    {
      slug: 'prompting',
      acces: 'gratuit', ordre: 2,
      nom: 'Professional Prompting',
      courte: "Get consistent results from AI, not lucky breaks",
      accroche: 'The difference between someone who "tries ChatGPT" and someone who produces with it: a method. Structure, context, iteration, verification: the foundation of all work with AI.',
      niveau: 'Fast-track course',
      duree: '3 days · 6 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'chat',
      probleme: [
        "Everyone uses AI. Almost nobody gets consistent results from it: brilliant one day, mush the next, with no idea why.",
        "The difference isn't the tool or the subscription. It's how you ask: the context you provide, the structure of the request, the format you demand, and the verification behind it.",
        "Six short modules, one method transferable to every model and every profession, and a library of fill-in templates.",
      ],
      publics: [
        "You use AI every day and sense you're only getting 20% out of it",
        "You write, analyze and summarize for a living",
        "Your team uses AI haphazardly and it shows",
        "You want the foundation before the specialized courses",
      ],
      modules: [
        { t: "Why your results are inconsistent", pts: ["What the model knows, guesses and invents", "Context, the only real lever", "The three-question test"] },
        { t: "The universal structure", pts: ["Context, goal, detail, constraints, format", "The six rules", "Before/after on real cases"] },
        { t: "Templates by profession", pts: ["Write, summarize, analyze, translate, structure", "20 fill-in templates", "Adapting them to your vocabulary"] },
        { t: "Iteration that converges", pts: ["Correct without starting over", "Diagnose before you fix", "When to open a fresh conversation"] },
        { t: "Verify: the anti-hallucination reflex", pts: ["Make it cite its sources", "Quick cross-checks", "What you never delegate"] },
        { t: "Automate your prompts", pts: ["Your templates as shortcuts", "Standing instructions", "The team library"] },
      ],
      faq: [
        { q: "ChatGPT, Claude, Gemini: which one does it work for?", r: "All of them. The method is model-independent; the examples show all three." },
        { q: "Is it redundant with module 4 of the mobile course?", r: "Module 4 applies prompting to code. Here it's the general method: writing, analysis, decision-making, every profession." },
      ],
    },

    {
      slug: 'firebase',
      acces: 'pack', ordre: 4,
      nom: 'Firebase: Your Serverless Backend',
      courte: "Accounts, data, payments: the back office of your app",
      accroche: "User accounts, real-time database, files, functions: everything an app needs behind the scenes, with no server to administer, for 0 € to start.",
      niveau: 'Comprehensive course',
      duree: '10 days · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'note',
      probleme: [
        "Your app needs a back office: accounts, data that syncs, files. The classic path (rent a server, administer it, secure it) is a full profession in itself.",
        "Firebase does that job for you, free at the start. But badly configured, it's also the database left open to the entire world, or the surprise 400 € bill.",
        "This course takes it in order: data, accounts, security rules (the real subject), functions, and the caps that guarantee the bill stays at zero.",
      ],
      publics: [
        "You took the mobile course and want to master module 9 in depth",
        "Your app needs accounts and sync",
        "You want to understand security rules instead of copying them",
        "You're building a SaaS and want a backend without DevOps",
      ],
      modules: [
        { t: "The map of Firebase", pts: ["What each service does", "What we won't use", "Create a project cleanly, region included"] },
        { t: "Firestore: thinking in documents", pts: ["Modeling without tables", "Queries and their limits", "Real time"] },
        { t: "Complete authentication", pts: ["Magic link, password, Google, Apple", "Sessions and persistence", "Account deletion (mandatory)"] },
        { t: "Security rules, the real subject", pts: ["Reading and writing rules", "Testing them", "The 5 patterns that cover 95% of apps"] },
        { t: "Cloud Functions", pts: ["When the client is no longer enough", "Webhooks and scheduled tasks", "Secrets and deployment"] },
        { t: "Storage: files", pts: ["Secure upload and download", "Images: resizing", "Dedicated rules"] },
        { t: "A bill that stays at zero", pts: ["Understanding the pricing", "Caps and alerts", "The loops that cost money and how to kill them"] },
        { t: "Capstone project: the complete backend of an app", pts: ["Accounts + data + files", "Secured and tested", "Production-ready"] },
      ],
      faq: [
        { q: "Firebase or Supabase?", r: "Both are good. Firebase is chosen here for its mobile maturity and because it's the one used in the flagship course; one module compares the two honestly." },
        { q: "Is it really free?", r: "Up to volumes you won't reach before thousands of active users. Module 7 locks the bill at zero." },
      ],
    },

    {
      slug: 'stripe',
      acces: 'solo', prix: 97, prixBarre: 247,
      nom: 'Get Paid Online with Stripe',
      courte: 'Payments, subscriptions, invoices: the complete circuit',
      accroche: "From your first payment link to subscriptions with webhooks: collect payments cleanly, compliantly, without losing sleep. Taught by someone who actually gets paid with it.",
      niveau: 'Comprehensive course',
      duree: '1 week · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'copier',
      probleme: [
        "Getting paid online looks simple until you actually do it: links or integration? Webhooks? VAT? Invoices? Refunds? Every question settled badly costs you money or a customer.",
        "Stripe is the reference tool, but its documentation is written for developer teams. Here it's translated for the independent selling a product or a course.",
        "The whole circuit, in order: the properly configured account, payment links, the webhook that delivers the purchase, subscriptions, and French compliance.",
      ],
      publics: [
        "You sell (or are about to sell) a digital product, a course, a service",
        "You have a SaaS and subscriptions scare you",
        "You want to understand what your webhook does at night",
        "Your accountant is asking for clean exports",
      ],
      modules: [
        { t: "A solid Stripe account", pts: ["Activation, identity, payouts", "Test mode and live mode", "The dashboard that matters"] },
        { t: "Sell without coding: Payment Links", pts: ["Products, prices, promotions", "Redirects and receipts", "What links can't do"] },
        { t: "The webhook: deliver what got paid", pts: ["Signature and security", "Granting access automatically", "Replaying failed events"] },
        { t: "Subscriptions", pts: ["Trials, renewals, failed cards", "The customer portal", "Cancellations and recovery"] },
        { t: "French compliance", pts: ["VAT, the franchise en base exemption, OSS", "Compliant invoices", "What your accountant wants"] },
        { t: "Refunds, disputes, fraud", pts: ["The calm procedure", "Winning a dispute", "Radar and prevention"] },
        { t: "The full circuit in production", pts: ["The go-live checklist", "The first real euro, tested", "Monitoring without thinking about it"] },
      ],
      faq: [
        { q: "Do I need to code?", r: "Modules 1, 2, 5 and 6: zero code. Webhooks and subscriptions require pasting a little, guided line by line, with AI helping." },
        { q: "Does it apply outside France?", r: "The core does; the compliance module is centered on France and the EU." },
      ],
    },

    {
      slug: 'aso',
      acces: 'pack', ordre: 7,
      nom: 'ASO: Get Found on the App Stores',
      courte: "App Store and Google Play rankings, methodically",
      accroche: "Your app is good but invisible? ASO is the only free, durable channel on the stores. Keywords, listing, screenshots, reviews: the complete method.",
      niveau: 'Fast-track course',
      duree: '4 days · 6 modules + 2 bonus',
      statut: 'disponible',
      prixE: 47,  prixEBarre: 97,
      prixC: 97,  prixCBarre: 197,
      couleurIco: 'etoile',
      probleme: [
        "Two million apps on the App Store. Without visibility work, yours gets two downloads a day, and they're your relatives.",
        "Advertising costs 2 to 5 € per install: unsustainable at the start. Store search ranking is free, durable, and methodical: it's a search engine, and you work it like one.",
        "Keywords, name, subtitle, screenshots that convert, reviews, updates: the full loop, with free tools to measure it all.",
      ],
      publics: [
        "Your app is live and not taking off",
        "You're about to publish and want to launch with the right listing",
        "You want to understand why that competitor keeps overtaking you",
        "You manage apps for clients",
      ],
      modules: [
        { t: "How the stores rank", pts: ["What carries weight at Apple, and at Google", "The differences that trap you", "Reading your current ranking"] },
        { t: "Keyword research", pts: ["The real queries, for free", "Volume versus competition", "The winning long tail"] },
        { t: "Name, subtitle, description", pts: ["The characters that count", "Apple versus Google: opposite indexing", "Rewrite your listing in one evening"] },
        { t: "Screenshots that convert", pts: ["The first one decides everything", "Titles and order", "Producing without a designer"] },
        { t: "Reviews and ratings", pts: ["The right moment to ask", "Reply to everything, especially the negative", "Raising an average"] },
        { t: "Measure and iterate", pts: ["The 3 numbers that matter", "Testing a variant cleanly", "The update rhythm"] },
      ],
      faq: [
        { q: "Isn't this already in the mobile course?", r: "Module 16 gives you the foundations in 22 minutes. Here you get the specialization: complete method, tools, iteration over several months." },
      ],
    },

    {
      slug: 'design-app',
      acces: 'pack', ordre: 6,
      nom: "App Design That Makes People Pay",
      courte: "The interface that turns a trial into a subscription",
      accroche: "90% of the gap between an amateur app and a pro app comes down to mechanical rules. Spacing, type, color, animations, paywall: apply them without being a designer.",
      niveau: 'Comprehensive course',
      duree: '1 week · 7 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'image',
      probleme: [
        'Your app works, but it "does not feel pro", and you cannot say why. Neither can your users: they just uninstall.',
        "The good news: it's almost never a question of talent. Inconsistent spacing, too many colors, missing hierarchy, missing animations: mechanical flaws, with mechanical fixes.",
        'Seven modules to bring your interface up to "paid app" level, with real before-and-afters and templates for the screens that matter: home, empty state, paywall, settings.',
      ],
      publics: [
        "Your app is functional but looks amateur",
        "You want a paywall that converts without scamming anyone",
        "You have AI generate your interface and it needs directing",
        "You're rebuilding your design system properly",
      ],
      modules: [
        { t: "The 6 mechanical rules", pts: ["Space above all", "3 text sizes, 1 accent", "The 20-minute audit of your app"] },
        { t: "The theme file", pts: ["Tokens: colors, spacing, radii", "Never a hardcoded value again", "Dark mode included"] },
        { t: "The screens that matter", pts: ["First launch and the empty screen", "Home: one action", "Settings that breathe"] },
        { t: "Motion", pts: ["The 3 animations that feel expensive", "Durations and curves", "Haptic feedback"] },
        { t: "The honest paywall that converts", pts: ["A proven structure", "Price and anchoring", "The dark patterns to refuse"] },
        { t: "Icon and identity", pts: ["Legible at 60 pixels", "The splash screen", "Store and app consistency"] },
        { t: "Directing AI on design", pts: ["The design prompts that work", "Enforcing the theme", "Efficient visual iteration"] },
      ],
      faq: [
        { q: "Redundant with module 10 of the mobile course?", r: "Module 10 lays down the 6 rules. Here: complete screen templates, the paywall in depth, identity, and art-directing the AI." },
      ],
    },

    {
      slug: 'micro-saas',
      acces: 'solo', prix: 197, prixBarre: 497,
      nom: 'Launch a Profitable Micro-SaaS',
      courte: "From idea to your first recurring subscriber, solo",
      accroche: "A small subscription product, one precise problem, recurring revenue. The complete solopreneur path: idea, AI-powered build, pricing, launch, first customers.",
      niveau: 'Advanced course',
      duree: '3 weeks · 10 modules + 2 bonus',
      statut: 'disponible',
      prixE: 127, prixEBarre: 247,
      prixC: 247, prixCBarre: 497,
      couleurIco: 'action',
      probleme: [
        "The dream: a product that earns while you sleep. The beginner's reality: six months on an app nobody was waiting for, launched to zero audience.",
        "Micro-SaaS flips the approach: a narrow, painful problem, an audience that gathers somewhere, a minimal tool sold by subscription before it's even finished.",
        "This course is the complete path, with AI as your technical team: validation, build, payments, launch, and the first three months that decide everything.",
      ],
      publics: [
        "You want recurring revenue, not gigs",
        "You finished the mobile or web course and are looking for what to build",
        "You have a SaaS idea and fear losing six months",
        "You want the complete method, business included",
      ],
      modules: [
        { t: "The micro in micro-SaaS", pts: ["Why small wins when you're solo", "The math of recurring revenue", "10 real examples dissected"] },
        { t: "Find the paying problem", pts: ["The 4 goldmines", "Validate in a week without coding", "The 5-conversation test"] },
        { t: "Sell before you build", pts: ["The page that sells the future product", "Honest pre-selling", "The threshold that triggers the build"] },
        { t: "Build the minimum sellable product", pts: ["Scope: cut, cut, cut", "The simple stack that holds", "AI as your technical team"] },
        { t: "Accounts, data, security", pts: ["The Firebase foundation or equivalent", "Multi-user done properly", "GDPR from day one"] },
        { t: "Plug in the subscription", pts: ["Stripe subscriptions", "Trials, dunning, failed cards", "The customer portal"] },
        { t: "Pricing", pts: ["By value, not by cost", "Tiers that push toward the middle", "Raising prices without losing early customers"] },
        { t: "The launch", pts: ["The waiting list that works for you", "Where and how to announce", "Launch week, hour by hour"] },
        { t: "The 90 days that decide", pts: ["Churn: understand it, reduce it", "Support that sells", "Iterate on the pain, not the requests"] },
        { t: "Grow or cash in", pts: ["Automate the funnel", "When to hire, when to stay solo", "Selling your micro-SaaS one day"] },
      ],
      faq: [
        { q: "How is this different from the mobile course?", r: "The mobile course teaches you to build and publish an app. Here, the product is a business: validation, pre-selling, subscriptions, launch, retention. They complement each other, in that order." },
        { q: "How much to get started?", r: "Under 100 € all included for the first year, not counting your time. The line-by-line breakdown is in module 1." },
      ],
    },

    {
      slug: 'seo-contenu',
      acces: 'pack', ordre: 8,
      nom: 'SEO & Content: Traffic That Compounds',
      courte: 'Get found on Google, durably, without an ad budget',
      accroche: "Advertising stops the moment you stop paying. Well-ranked content works for years. The complete method: keywords, pages, technical SEO, authority.",
      niveau: 'Comprehensive course',
      duree: '10 days · 8 modules + 2 bonus',
      statut: 'disponible',
      prixE: 67,  prixEBarre: 127,
      prixC: 127, prixCBarre: 247,
      couleurIco: 'aide',
      probleme: [
        "Your product exists, so does your site, and Google ignores you. Meanwhile, weaker competitors capture the searches that should be yours.",
        "SEO is neither dead nor magic: it's a methodical craft, transformed by AI (which writes with you) and shaken by it (AI answers change the game; the course tackles the subject head-on).",
        "From technical foundations to pages that rank, from keyword research to backlinks: the complete circuit for traffic with no meter to refill.",
      ],
      publics: [
        "Your site or store only gets paid traffic",
        "You're launching a product and want a durable channel",
        "You already write but nobody finds your pages",
        "You want to use AI to produce content without being penalized",
      ],
      modules: [
        { t: "How Google decides", pts: ["What actually counts right now", "The myths that waste your time", "The impact of AI answers, honestly"] },
        { t: "Keyword research", pts: ["Intent before volume", "The free tools that are enough", "Your 6-month content map"] },
        { t: "The page that ranks", pts: ["Structure, headings, depth", "Writing with AI without producing mush", "Originality you can measure"] },
        { t: "Technical SEO without jargon", pts: ["Speed, mobile, indexing", "Sitemap, robots, structured data", "The one-hour audit"] },
        { t: "Internal linking and architecture", pts: ["Pillar pages and satellites", "The internal links that push", "Avoiding self-cannibalization"] },
        { t: "Authority: backlinks", pts: ["What works without a budget", "What gets you penalized", "The realistic pace"] },
        { t: "Measuring", pts: ["Search Console mastered", "The 4 useful indicators", "Deciding what to rework"] },
        { t: "The production system", pts: ["The calendar you can sustain solo", "AI in the loop, in the right place", "A concrete 6-month plan"] },
      ],
      faq: [
        { q: "Isn't SEO dead because of AI?", r: "Simple informational traffic is falling; the rest is shifting. Module 1 tackles the subject head-on, numbers in hand, and the method targets what remains durable: purchase intent, brand, depth." },
      ],
    },
  ],

  /* --- The pack ----------------------------------------------------------- */
  pack: {
    slug: 'pack',
    nom: 'The App Developer Path',
    accroche: "One guiding thread: from your first line of code to your app published on the stores. Three courses free to start, one payment for everything else, lifetime access.",
    prix: 297,
    prixBarre: 675,
  },

  /* Pack price: sum of the courses at the given tier, minus the discount. */
  prixPack(niveau) {
    const cle = niveau === 'avance' ? 'prixC' : 'prixE';
    const somme = this.formations.reduce((n, f) => n + f[cle], 0);
    return { plein: somme, prix: Math.round(somme * (1 - this.pack.remise)) };
  },

  /* Pro rata: what the buyer already owns is deducted from the pack, at the
     chosen tier's price. We deduct generously (the pack tier's price, even
     if they only own Essential): simple, readable, never disputed. */
  prixPackPerso(niveau, achats) {
    const cle = niveau === 'avance' ? 'prixC' : 'prixE';
    const base = this.prixPack(niveau);
    let deja = 0;
    for (const f of this.formations) {
      if (achats && achats[f.slug]) deja += f[cle];
    }
    const prix = Math.max(this.pack.plancher, base.prix - deja);
    const remisePct = Math.round((1 - prix / base.plein) * 100);
    return { plein: base.plein, packPlein: base.prix, deja, prix, remisePct };
  },

  parSlug(slug) { return this.formations.find((f) => f.slug === slug) || null; },
};

/* Stripe payment links: filled by the configuration (config.js) or by the
   generator. Keys: `${slug}:essentiel`, `${slug}:complet`,
   `pack:basic`, `pack:avance`. */
CATALOGUE.liens = (typeof window !== 'undefined' && window.AZ && window.AZ.liens) || {};

if (typeof window !== 'undefined') window.CATALOGUE = CATALOGUE;
if (typeof module !== 'undefined') module.exports = CATALOGUE;
export default CATALOGUE;
export { CATALOGUE };
