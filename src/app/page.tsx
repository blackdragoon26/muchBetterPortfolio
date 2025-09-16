// import { HackathonCard } from "@/components/hackathon-card";
// import BlurFade from "@/components/magicui/blur-fade";
// import BlurFadeText from "@/components/magicui/blur-fade-text";
// import { ProjectCard } from "@/components/project-card";
// import { ResumeCard } from "@/components/resume-card";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { Badge } from "@/components/ui/badge";
// import { DATA } from "@/data/resume";
// import Link from "next/link";
// import Markdown from "react-markdown";

// const BLUR_FADE_DELAY = 0.04;

// export default function Page() {
//   return (
//     <main className="flex flex-col min-h-[100dvh] space-y-10">
//       <section id="hero">
//         <div className="mx-auto w-full max-w-2xl space-y-8">
//           <div className="gap-2 flex justify-between">
//             <div className="flex-col flex flex-1 space-y-1.5">
//               <BlurFadeText
//                 delay={BLUR_FADE_DELAY}
//                 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none"
//                 yOffset={8}
//                 text={`Hihi, ${DATA.name.split(" ")[0]} here`}
//               />
//               <BlurFadeText
//                 className="max-w-[600px] md:text-xl"
//                 delay={BLUR_FADE_DELAY}
//                 text={DATA.description}
//               />
//             </div>
//             <BlurFade delay={BLUR_FADE_DELAY}>
//               <Avatar className="size-28 border">
//                 <AvatarImage alt={DATA.name} src={DATA.avatarUrl} />
//                 <AvatarFallback>{DATA.initials}</AvatarFallback>
//               </Avatar>
//             </BlurFade>
//           </div>
//         </div>
//       </section>
//       <section id="about">
//         <BlurFade delay={BLUR_FADE_DELAY * 3}>
//           <h2 className="text-xl font-bold"></h2>
//         </BlurFade>
//         <BlurFade delay={BLUR_FADE_DELAY * 4}>
//           <Markdown className="prose max-w-full text-pretty font-sans text-sm text-muted-foreground dark:prose-invert">
//             {DATA.summary}
//           </Markdown>
//         </BlurFade>
//       </section>
//       <section id="work">
//         <div className="flex min-h-0 flex-col gap-y-3">
//           <BlurFade delay={BLUR_FADE_DELAY * 5}>
//             <h2 className="text-xl font-bold">Work Experience</h2>
//           </BlurFade>
//           {DATA.work.map((work, id) => (
//             <BlurFade
//               key={work.company}
//               delay={BLUR_FADE_DELAY * 6 + id * 0.05}
//             >
//               <ResumeCard
//                 key={work.company}
//                 logoUrl={work.logoUrl}
//                 altText={work.company}
//                 title={work.company}
//                 subtitle={work.title}
//                 href={work.href}
//                 badges={work.badges}
//                 period={`${work.start} - ${work.end ?? "Present"}`}
//                 description={work.description}
//               />
//             </BlurFade>
//           ))}
//         </div>
//       </section>
//       <section id="education">
//         <div className="flex min-h-0 flex-col gap-y-3">
//           <BlurFade delay={BLUR_FADE_DELAY * 7}>
//             <h2 className="text-xl font-bold">Education</h2>
//           </BlurFade>
//           {DATA.education.map((education, id) => (
//             <BlurFade
//               key={education.school}
//               delay={BLUR_FADE_DELAY * 8 + id * 0.05}
//             >
//               <ResumeCard
//                 key={education.school}
//                 href={education.href}
//                 logoUrl={education.logoUrl}
//                 altText={education.school}
//                 title={education.school}
//                 subtitle={education.degree}
//                 period={`${education.start} - ${education.end}`}
//               />
//             </BlurFade>
//           ))}
//         </div>
//       </section>
//       <section id="projects">
//         <div className="space-y-12 w-full py-12">
//           <BlurFade delay={BLUR_FADE_DELAY * 11}>
//             <div className="flex flex-col items-center justify-center space-y-4 text-center">
//               <div className="space-y-2">
//                 <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
//                   My Work
//                 </div>
//                 <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
//                   Check out my latest work
//                 </h2>
//                 <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
//                   Worked on Programmable Networks and subtle Backend-Devops stuff.
//                 </p>
//               </div>
//             </div>
//           </BlurFade>
//           <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-[800px] mx-auto">
//             {DATA.projects.map((project, id) => (
//               <BlurFade
//                 key={project.title}
//                 delay={BLUR_FADE_DELAY * 12 + id * 0.05}
//               >
//                 <ProjectCard
//                   href={project.href}
//                   key={project.title}
//                   title={project.title}
//                   description={project.description}
//                   dates={project.dates}
//                   tags={project.technologies}
//                   image={project.image}
//                   video={project.video}
//                   links={project.links}
//                 />
//               </BlurFade>
//             ))}
//           </div>
//         </div>
//       </section>
//       <section id="hackathons">
//         <div className="space-y-12 w-full py-12">
//           <BlurFade delay={BLUR_FADE_DELAY * 13}>
//             <div className="flex flex-col items-center justify-center space-y-4 text-center">
//               <div className="space-y-2">
//                 <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
//                   Events
//                 </div>
//                 <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
//                   as said, I love to yap
//                 </h2>
//                 <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
//                   Cave-Humans, around the world gather together to share their crazy stories. 
//                   Some highly relatable, some too unrelatable that makes it motivating to make it relate.
//                   Either ways, always new stuff happening around in the world.
//                 </p>
//               </div>
//             </div>
//           </BlurFade>
//           <BlurFade delay={BLUR_FADE_DELAY * 14}>
//             <ul className="mb-4 ml-4 divide-y divide-dashed border-l">
//               {DATA.hackathons.map((project, id) => (
//                 <BlurFade
//                   key={project.title + project.dates}
//                   delay={BLUR_FADE_DELAY * 15 + id * 0.05}
//                 >
//                   <HackathonCard
//                     title={project.title}
//                     description={project.description}
//                     location={project.location}
//                     dates={project.dates}
//                     image={project.image}
//                     links={project.links}
//                   />
//                 </BlurFade>
//               ))}
//             </ul>
//           </BlurFade>
//         </div>
//       </section>
//       <section id="contact">
//         <div className="grid items-center justify-center gap-4 px-4 text-center md:px-6 w-full py-12">
//           <BlurFade delay={BLUR_FADE_DELAY * 16}>
//             <div className="space-y-3">
//               <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
//                 Contact
//               </div>
//               <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
//                 Get in Touch
//               </h2>
//               <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
//                 Wanna roast me on how I copied? Fry me on {" "}
//                 <Link
//                   href={DATA.contact.social.X.url}
//                   className="text-blue-500 hover:underline"
//                 >
//                   dms
//                 </Link>{" "}
//                 , btw I play CSGO.
//               </p>
//             </div>
//           </BlurFade>
//         </div>
//       </section>
//        <section id="otherStuff">
//         <div className="space-y-12 w-full py-12">
//           <BlurFade delay={BLUR_FADE_DELAY * 11}>
//             <div className="flex flex-col items-center justify-center space-y-4 text-center">
//               <div className="space-y-2">
//                 <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
//                   otherStuff
//                 </div>
//                 <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
//                   random photos and sports arc
//                 </h2>
//                 <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
//                   unhinged curricular activities
//                 </p>
//               </div>
//             </div>
//           </BlurFade>
//           <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-[800px] mx-auto">
//             {DATA.projects.map((project, id) => (
//               <BlurFade
//                 key={project.title}
//                 delay={BLUR_FADE_DELAY * 12 + id * 0.05}
//               >
//                 <ProjectCard
//                   href={project.href}
//                   key={project.title}
//                   title={project.title}
//                   description={project.description}
//                   dates={project.dates}
//                   tags={project.technologies}
//                   image={project.image}
//                   video={project.video}
//                   links={project.links}
//                 />
//               </BlurFade>
//             ))}
//           </div>
//         </div>
//       </section>
//     </main>
//   );
// }

"use client";

import { HackathonCard } from "@/components/hackathon-card";
import BlurFade from "@/components/magicui/blur-fade";
import BlurFadeText from "@/components/magicui/blur-fade-text";
import { ProjectCard } from "@/components/project-card";
import { ResumeCard } from "@/components/resume-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DATA } from "@/data/resume";
import Link from "next/link";
import Markdown from "react-markdown";
import { useState } from "react";
// import { OtherStuffCard } from "@/components/otherstuff-card";

const BLUR_FADE_DELAY = 0.04;

export default function Page() {
  const [showOtherStuff, setShowOtherStuff] = useState(false);

  return (
    <main className="flex flex-col min-h-[100dvh] space-y-10">
      <section id="hero">
        <div className="mx-auto w-full max-w-2xl space-y-8">
          <div className="gap-2 flex justify-between">
            <div className="flex-col flex flex-1 space-y-1.5">
              <BlurFadeText
                delay={BLUR_FADE_DELAY}
                className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none"
                yOffset={8}
                text={`Hihi, ${DATA.name.split(" ")[0]} here`}
              />
              <BlurFadeText
                className="max-w-[600px] md:text-xl"
                delay={BLUR_FADE_DELAY}
                text={DATA.description}
              />
            </div>
            <BlurFade delay={BLUR_FADE_DELAY}>
              <Avatar className="size-28 border">
                <AvatarImage alt={DATA.name} src={DATA.avatarUrl} />
                <AvatarFallback>{DATA.initials}</AvatarFallback>
              </Avatar>
            </BlurFade>
          </div>
        </div>
      </section>
      <section id="about">
        <BlurFade delay={BLUR_FADE_DELAY * 3}>
          <h2 className="text-xl font-bold"></h2>
        </BlurFade>
        <BlurFade delay={BLUR_FADE_DELAY * 4}>
          <Markdown className="prose max-w-full text-pretty font-sans text-sm text-muted-foreground dark:prose-invert">
            {DATA.summary}
          </Markdown>
        </BlurFade>
      </section>
      <section id="work">
        <div className="flex min-h-0 flex-col gap-y-3">
          <BlurFade delay={BLUR_FADE_DELAY * 5}>
            <h2 className="text-xl font-bold">Work Experience</h2>
          </BlurFade>
          {DATA.work.map((work, id) => (
            <BlurFade
              key={work.company}
              delay={BLUR_FADE_DELAY * 6 + id * 0.05}
            >
              <ResumeCard
                key={work.company}
                logoUrl={work.logoUrl}
                altText={work.company}
                title={work.company}
                subtitle={work.title}
                href={work.href}
                badges={work.badges}
                period={`${work.start} - ${work.end ?? "Present"}`}
                description={work.description}
              />
            </BlurFade>
          ))}
        </div>
      </section>
      <section id="education">
        <div className="flex min-h-0 flex-col gap-y-3">
          <BlurFade delay={BLUR_FADE_DELAY * 7}>
            <h2 className="text-xl font-bold">Education</h2>
          </BlurFade>
          {DATA.education.map((education, id) => (
            <BlurFade
              key={education.school}
              delay={BLUR_FADE_DELAY * 8 + id * 0.05}
            >
              <ResumeCard
                key={education.school}
                href={education.href}
                logoUrl={education.logoUrl}
                altText={education.school}
                title={education.school}
                subtitle={education.degree}
                period={`${education.start} - ${education.end}`}
              />
            </BlurFade>
          ))}
        </div>
      </section>
      <section id="projects">
        <div className="space-y-12 w-full py-12">
          <BlurFade delay={BLUR_FADE_DELAY * 11}>
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
                  My Work
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Check out my latest work
                </h2>
                <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Worked on Programmable Networks and subtle Backend-Devops stuff.
                </p>
              </div>
            </div>
          </BlurFade>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-[800px] mx-auto">
            {DATA.projects.map((project, id) => (
              <BlurFade
                key={project.title}
                delay={BLUR_FADE_DELAY * 12 + id * 0.05}
              >
                <ProjectCard
                  href={project.href}
                  key={project.title}
                  title={project.title}
                  description={project.description}
                  dates={project.dates}
                  tags={project.technologies}
                  image={project.image}
                  video={project.video}
                  links={project.links}
                />
              </BlurFade>
            ))}
          </div>
        </div>
      </section>
      <section id="hackathons">
        <div className="space-y-12 w-full py-12">
          <BlurFade delay={BLUR_FADE_DELAY * 13}>
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
                  Events
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  as said, I love to yap
                </h2>
                <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Cave-Humans, around the world gather together to share their crazy stories. 
                  Some highly relatable, some too unrelatable that makes it motivating to make it relate.
                  Either ways, always new stuff happening around in the world.
                </p>
              </div>
            </div>
          </BlurFade>
          <BlurFade delay={BLUR_FADE_DELAY * 14}>
            <ul className="mb-4 ml-4 divide-y divide-dashed border-l">
              {DATA.hackathons.map((project, id) => (
                <BlurFade
                  key={project.title + project.dates}
                  delay={BLUR_FADE_DELAY * 15 + id * 0.05}
                >
                  <HackathonCard
                    title={project.title}
                    description={project.description}
                    location={project.location}
                    dates={project.dates}
                    image={project.image}
                    links={project.links}
                  />
                </BlurFade>
              ))}
            </ul>
          </BlurFade>
        </div>
      </section>
      <section id="contact">
        <div className="grid items-center justify-center gap-4 px-4 text-center md:px-6 w-full py-12">
          <BlurFade delay={BLUR_FADE_DELAY * 16}>
            <div className="space-y-3">
              <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
                Contact
              </div>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                Get in Touch
              </h2>
              <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Wanna roast me on how I copied? Fry me on {" "}
                <Link
                  href={DATA.contact.social.X.url}
                  className="text-blue-500 hover:underline"
                >
                  dms
                </Link>{""}
                , btw I play CSGO.
              </p>
            </div>
          </BlurFade>
        </div>
      </section>
      
      {/* Toggle Button for Other Stuff */}
      {/* <div className="flex justify-center w-full py-6">
        <BlurFade delay={BLUR_FADE_DELAY * 17}>
          <button
            onClick={() => setShowOtherStuff(!showOtherStuff)}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-6 py-3 text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            {showOtherStuff ? "Hide" : "Show"} unwanted
            <svg 
              className={`w-4 h-4 transition-transform ${showOtherStuff ? "rotate-180" : ""}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </BlurFade>
      </div> */}

      {/* Collapsible Other Stuff Section */}
      {showOtherStuff && (
        <section id="otherStuff">
          <div className="space-y-12 w-full py-12">
            <BlurFade delay={0.1}>
              <div className="flex flex-col items-center justify-center space-y-4 text-center">
                <div className="space-y-2">
                  <div className="inline-block rounded-lg bg-foreground text-background px-3 py-1 text-sm">
                    otherStuff
                  </div>
                  <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                    sports arc and random pics
                  </h2>
                  <p className="text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                    unhinged curricular activities
                  </p>
                </div>
              </div>
            </BlurFade>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-[800px] mx-auto">
              {DATA.otherStuff.map((otherStuff, id) => (
                <BlurFade
                  key={`other-${otherStuff.title}`}
                  delay={0.2 + id * 0.05}
                >
                  <OtherStuffCard
                  title={otherStuff.title}
                  image={otherStuff.image}
                  // description={otherStuff.description}
                  date={otherStuff.date}
                  type={otherStuff.type}
                  // location={otherStuff.location}
                />
                </BlurFade>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}