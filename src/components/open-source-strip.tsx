import Image from "next/image";
import styles from "./open-source-strip.module.css";

interface Mark {
  name: string;
  logo: string;
  href?: string;
  work?: string;
}

const marks: readonly Mark[] = [
  { name: "P4 Language", logo: "/generated/organizations/p4lang.jpg", href: "https://github.com/p4lang/p4c/pull/5756", work: "Merged compiler PR" },
  { name: "Intel Tofino", logo: "/open-source/intel.svg", href: "https://splidt-showcase.vercel.app/", work: "Target hardware for the SpliDT GSoC project" },
  { name: "C++", logo: "/open-source/cplusplus.svg" },
  { name: "HAMi", logo: "/generated/organizations/project-hami.jpg", href: "https://github.com/Project-HAMi/HAMi/pull/3422", work: "Merged scheduler PR" },
  { name: "AMD · HAMi", logo: "/open-source/amd.svg", href: "https://github.com/Project-HAMi/HAMi-DRA/pull/198", work: "Merged AMD GPU allocation tests" },
  { name: "Go", logo: "/open-source/go.svg" },
  { name: "Kubernetes", logo: "/open-source/kubernetes.svg" },
  { name: "KubeEdge", logo: "/open-source/kubeedge.png", href: "https://github.com/kubeedge/website/pull/876", work: "Documentation PR under review" },
  { name: "WasmEdge Runtime", logo: "/generated/organizations/wasmedge.jpg", href: "https://github.com/WasmEdge/WasmEdge/pull/4470", work: "Merged WASI clock fix" },
  { name: "WebAssembly", logo: "/open-source/webassembly.svg" },
  { name: "Rust", logo: "/open-source/rust.svg" },
  { name: "Framework", logo: "/generated/organizations/frameworkcomputer.jpg", href: "https://github.com/FrameworkComputer/framework-system/pull/369", work: "Merged Framework Laptop thermal tooling PR" },
  { name: "Meta · bpfilter", logo: "/generated/organizations/meta.jpg", href: "https://github.com/meta/bpfilter/pull/578", work: "Merged packet logging PR" },
  { name: "C", logo: "/open-source/c.svg" },
  { name: "libCacheSim", logo: "/generated/organizations/1a1a11a.jpg", href: "https://github.com/1a1a11a/libCacheSim/pull/358", work: "Merged cache policy validation PR" },
  { name: "Bash", logo: "/open-source/gnubash.svg" },
  { name: "Intel", logo: "/open-source/intel.svg", href: "https://xnic-v1.vercel.app/", work: "Intel 82540EM hardware target for the XNIC driver lab" },
  { name: "Harbor", logo: "/generated/organizations/goharbor.jpg", href: "https://github.com/goharbor/harbor-cli/pull/529", work: "Merged Harbor CLI documentation PR" },
  { name: "Python", logo: "/open-source/python.svg" },
  { name: "vLLM", logo: "/open-source/vllm.png", href: "https://github.com/vllm-project/vllm/issues/67779", work: "Bug report" },
  { name: "SGLang", logo: "/open-source/sglang.png", href: "https://github.com/sgl-project/sglang/issues/50422", work: "Bug report" },
  { name: "iOS", logo: "/open-source/apple.svg", href: "https://github.com/blackdragoon26/BlossomMovie" },
  { name: "Swift", logo: "/open-source/swift.svg", href: "https://github.com/blackdragoon26/BlossomMovie" }, ];

export function OpenSourceStrip() {
  return (
    <section aria-labelledby="open-source-strip-title" className={styles.section}>
      <h2 id="open-source-strip-title" className={styles.heading}>Open source &amp; tools</h2>
      <div className={styles.viewport}>
        <div className={styles.track}>
          {[false, true].map((copy) => (
            <ul key={String(copy)} className={copy ? `${styles.group} ${styles.copy}` : styles.group} aria-hidden={copy || undefined}>
              {marks.map(({ name, logo, href, work }) => {
                const label = <><Image src={logo} alt="" width={26} height={26} />{name}</>;
                return (
                  <li key={name} className={styles.mark}>
                    {href ? (
                      <a href={href} tabIndex={copy ? -1 : undefined} aria-label={work ? `${name}: ${work}` : undefined} title={work}>
                        {label}
                      </a>
                    ) : <span>{label}</span>}
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
