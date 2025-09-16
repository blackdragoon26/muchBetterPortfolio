import { Icons } from "@/components/icons";
import { HomeIcon, NotebookIcon } from "lucide-react";
import { title } from "process";

export const DATA = {
  name: "Sankalp",
  initials: "SJ",
  url: "https://sankalpjha.dev",
  location: "Delhi NCR, IND",
  locationLink: "https://www.google.com/maps/place/National+Capital+Region/@28.3243111,74.3343587,7z/data=!3m1!4b1!4m6!3m5!1s0x390ce19466e19ae1:0x45ceeb565fd5de6c!8m2!3d28.4020007!4d76.8259652!16s%2Fm%2F025s8rd?entry=ttu&g_ep=EgoyMDI1MDkwOC4wIKXMDSoASAFQAw%3D%3D",
  description:
    "21, tech-savvy who loves to yap",
  summary:
    "",
  avatarUrl: "/me.png",
  skills: [
    "React",
    "Next.js",
    "Typescript",
    "Node.js",
    "Postgres",
    "Go",
    "Docker",
    "k8s",
    "C++",
    "P4",
    "eBPF",
    "gRPC",
    "Bash",
    "Makefile",
    "Python",
    "Neovim"
  ],
  navbar: [
    { href: "/", icon: HomeIcon, label: "Home" },
    { href: "https://medium.com/@sankalp.jha9643", icon: NotebookIcon, label: "Blog" },
  ],
  contact: {
    email: "sankalp.jha9643@gmail.com",
    tel: "(+91)8800117422",
    social: {
      GitHub: {
        name: "GitHub",
        url: "https://github.com/blackdragoon26",
        icon: Icons.github,

        navbar: true,
      },
      LinkedIn: {
        name: "LinkedIn",
        url: "https://www.linkedin.com/in/sankalp-jha-18a95a244/",
        icon: Icons.linkedin,

        navbar: true,
      },
      X: {
        name: "X",
        url: "https://x.com/SankalpJha26",
        icon: Icons.x,

        navbar: true,
      },
      Youtube: {
        name: "Youtube",
        url: "https://dub.sh/dillion-youtube",
        icon: Icons.youtube,
        navbar: false,
      },
      email: {
        name: "Send Email",
        url: "sankalp.jha9643@gmail.com",
        icon: Icons.email,

        navbar: true,
      },
    },
  },

  work: [
    {
      company: "The P4 Language Consortium",
      href: "https://p4.org",
      badges: [],
      location: "Remote",
      title: "Google Summer of Code 2025 Contributor",
      logoUrl: "/p4-logo.svg",
      start: "May 2025",
      end: "Present",
      description:
      "Developed on a Research Project, spliDT ML-Framework, a partition-based approach for implementing decision tree inference directly in real-time networks at the data plane  for better security and performance using P4."
    },
    {
      company: "Google Developer Groups on Campus AKGEC",
      badges: [],
      href: "https://gdgakgec.org/team",
      location: "Hybrid",
      title: "Co-Organizer",
      logoUrl: "/1631369005402.jpeg",
      start: "September 2024",
      end: "Present",
      description:
        "Co-led the execution of 10+ tech event, engaging 1500+ developers, while managing end-to-end content, logistics, and team coordination of 35+ crew members.",
    },
    {
      company: "Cloud Native Community Group Delhi",
      href: "https://community.cncf.io/cloud-native-new-delhi/",
      badges: [],
      location: "New Delhi, India",
      title: "Senior Content Writer",
      logoUrl: "/cncg_new_delhi_logo.jpeg",
      start: "May 2024",
      end: "September 2024",
      description:
      "Lead the team of 6+ content writers and 4 designers to provide documentation support and overall management in community events."
    },
  ],
  education: [
    {
      school: "100xDevs",
      href: "https://app.100xdevs.com/",
      degree: "Super-30",
      logoUrl: "/X 400x400.jpg",
      start: "August 2025",
      end: "Present",
    },
    {
      school: "Ajay Kumar Garg Engineering College",
      href: "https://www.akgec.ac.in",
      degree: "Bachelor's of Technology (Information Technology)",
      logoUrl: "/AKGEC_1_0.png",
      start: "2022",
      end: "2026",
    },

  ],
  projects: [
    {
      title: "SpliDT: Scaling Stateful Decision Tree Algorithms in P4",
      href: "https://github.com/p4lang/gsoc/blob/main/2025/projects/spliDT/README.md",
      dates: "March 2025 - Present",
      active: true,
      description:
        "Developed on a Research Project, spliDT ML-Framework, a partition-based approach for implementing decision tree inference directly in real-time networks at the data plane  for better security and performance using P4. (Codebase could be private due to its research nature)",
      technologies: [
        "Python",
        "Jinja2",
        "Scapy",
        "Pickle",
        "Pandas",
        "NumPy",
        "gRPC",
        "P4",
        "Makefile",
        "Bash",
        "Docker",
        "Mininet BMv2",
        "Stratum",
        "Grafana Prometheus",
        "HyperMapper",
        "p4studio",
        "CICFlowmeter",
        "Intel Tofino",
        "Barefoot SDE",
        "P4Runtime",
        "Smart NICs & FPGAs",
        "Match-Action Tables",
        "TCAMs/SRAMs"
      ],
      links: [
        {
          type: "Repository",
          href: "https://github.com/p4lang/gsoc/blob/main/2025/projects/spliDT/README.md",
          icon: <Icons.github className="size-3" />,
        },
      ],
      image: "",
      video:
        "Screen Recording Jun 11 2025.mov",
    },
    {
      title: "Multi-Hop Route Inspection(MRI)",
      href: "https://github.com/blackdragoon26/Multi-Hop-Route-Inspection-MRI-Implementation.git",
      dates: "May 2025",
      active: true,
      description:
        "Extended a basic Layer 3 forwarding program with a simplified version of In-Band Network Telemetry (INT), which tracks the path of each packet and records queue lengths at every switch by attaching switch IDs and queue depths, which can be read at the destination.",
      technologies: [
        "Python",
        "P4",
        "Makefile",
        "Docker",
        "Mininet BMv2",
        "Scapy",
      ],
      links: [
        {
          type: "Repository",
          href: "https://github.com/blackdragoon26/Multi-Hop-Route-Inspection-MRI-Implementation.git",
          icon: <Icons.github className="size-3" />,
        },
      ],
      image: "/Multi Hop Route Inspection Implementation.png",
      video: "",
    },
    {
      title: "Keploy GitHub Stargazers",
      href: "https://llm.report",
      dates: "April 2025",
      active: true,
      description:
        "Improved API Fetching Mechanism & Removed Hardcoded Tokens to enhance reliability and security of the application.",
      technologies: [
        "Next.js",
        "TypeScript",
        "JavaScript",
        "TailwindCSS",
      ],
      links: [
        {
          type: "Repository",
          href: "https://github.com/keploy/keploy-stargazers.git",
          icon: <Icons.github className="size-3" />,
        },
      ],
      image: "",
      video: "/AI Powered API Testing in 60 Seconds.mp4",
    },
        {
      title: "W2W: What to Watch",
      href: "https://llm.report",
      dates: "April 2024",
      active: true,
      description:
        "Developed a content-based Movie Recommendation System using Streamlit for deployment and Kaggles TMDB dataset for training, leveraging libraries like Pandas, and Scikit-learn to achieve ~85% relevancy accuracy in recommendations.",
      technologies: [
        "Jupyter Notebook",
        "Python",
        "pickle",
        "pandas",
        "scikit-learn",
        "streamlit",
        "kaggle",
        "Git LFS"
      ],
      links: [
        {
          type: "Repository",
          href: "https://github.com/blackdragoon26/W2W.git",
          icon: <Icons.github className="size-3" />,
        },
      ],
      image: "",
      video: "/Screen Recording 2025-09-16 at 4.21.49 PM.mov",
    },
  ],
  hackathons: [
    {
      title: "KubeCon + CloudNativeCon India 2024",
      dates: "December 11th - 12th, 2024",
      location: "YashoBhoomi, Dehi",
      description:
        "Spent two incredible days at KubeCon India, learning from legends, vibing with friends, meeting mentors, and soaking in the absolute prime of CNCF!",
      image:
        "KubeCon CloudNativeCon India 2024 logo.jpeg",
      links: [
          {
          title: "LinkedIn",
          href: "https://www.linkedin.com/posts/sankalp-jha-18a95a244_wasm-activity-7273777600446013440-GAKT?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADynRXoByTKgoc9YS3dOMkn3RoKHYUfZ2oI",
          icon: <Icons.linkedin className="size-3" />,
        },
        {
          type: "X",
          href: "https://x.com/SankalpJha26/status/1866883467348512785",
          icon: <Icons.x className="size-3" />,
        },

      ],
    },
    {
      title: "InitKubecon: Connecting People",
      dates: "December 7th 2024",
      location: "IIT Delhi",
      description:
        "Attended InitKubeCon IIT Delhi—met old friends, new faces like 🎙️Bart Farrell, learned tons, and now pumped for KubeCon India!",
      image:
        "cncg_new_delhi_logo.jpeg",
      mlh: "https://s3.amazonaws.com/logged-assets/trust-badge/2019/mlh-trust-badge-2019-white.svg",
      links: [
          {
          title: "LinkedIn",
          href: "https://www.linkedin.com/posts/sankalp-jha-18a95a244_kubecon-kubecon-kubecon-activity-7272333260670533632-Knkb?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADynRXoByTKgoc9YS3dOMkn3RoKHYUfZ2oI",
          icon: <Icons.linkedin className="size-3" />,
        },
        {
          type: "X",
          href: "https://x.com/SankalpJha26/status/1865708893550035393",
          icon: <Icons.x className="size-3" />,
        },
      ],
    },
    {
      title: "The Ace'24 Fest",
      dates: "September 2024",
      location: "Delhi Technical Campus, Greater Noida",
      description:
        "Hosted the Fusion track at ACE’24, met amazing speakers, bonded with an electrifying team, and vibed with the energetic Delhi NCR crowd that made the event unforgettable!",
      icon: "public",
      image:
        "The Ace Logo.jpeg",
      links: [
          {
          title: "LinkedIn",
          href: "https://www.linkedin.com/posts/sankalp-jha-18a95a244_the-lore-for-this-event-goes-like-this-activity-7240102105275846656-94Tm?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADynRXoByTKgoc9YS3dOMkn3RoKHYUfZ2oI",
          icon: <Icons.linkedin className="size-3" />,
        },
        {
          type: "X",
          href: "https://x.com/SankalpJha26/status/1829783610691387712",
          icon: <Icons.x className="size-3" />,
        },

      ],
    },
    {
      title: "Google WoW Delhi NCR’24",
      dates: "April 2024",
      location: "IIIT Delhi",
      description:
        "Developed a web application which aggregates social media data regarding cryptocurrencies and predicts future prices.",
      image:
        "WoW Post Image.jpeg",
      links: [
          {
          title: "LinkedIn",
          href: "https://www.linkedin.com/posts/sankalp-jha-18a95a244_google-wow-delhi-ncr24-canon-event-yes-activity-7239033685814001664-Rx0M?utm_source=social_share_send&utm_medium=member_desktop_web&rcm=ACoAADynRXoByTKgoc9YS3dOMkn3RoKHYUfZ2oI",
          icon: <Icons.linkedin className="size-3" />,
        },
      ],
    },
  ],


  otherStuff: [
  {
    title: "Morning Run at Marina Bay",
    image: "/images/running.jpg",
    description: "5km run with amazing sunrise views",
    date: "Dec 2024",
    type: "sports",
    location: "Singapore"
  },
  {
    title: "Random Coffee Art",
    image: "/images/coffee.jpg", 
    type: "photo",
    date: "Nov 2024"
  }
]

} as const;
