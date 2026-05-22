import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  ShieldCheck, 
  Target, 
  TrendingUp, 
  Building, 
  ArrowRight, 
  BarChart3, 
  Briefcase, 
  FileText,
  AlertCircle,
  Lock,
  ChevronRight,
  Fingerprint,
  Activity,
  Crosshair
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const naiduLogo = "/NPC_navbar_header-removebg-preview.png";
const mainVslVideoUrl = "https://dduzbchuswwbefdunfct.supabase.co/storage/v1/object/public/vsl-media/videos/main-vsl-v1/main-vsl-1.mp4";
const mainVslPosterUrl = "https://dduzbchuswwbefdunfct.supabase.co/storage/v1/object/public/vsl-media/posters/main-vsl-1.jpg";

// -------------------------------------------------------------
// ANIMATION VARIANTS
// -------------------------------------------------------------
const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
};

const staggerContainer = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: "-100px" },
  transition: { staggerChildren: 0.15, delayChildren: 0.1 }
};

const staggerItem = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
};

// -------------------------------------------------------------
// REUSABLE UI COMPONENTS
// -------------------------------------------------------------

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline', breather?: boolean }>(
  ({ children, className, variant = 'primary', breather = false, ...props }, ref) => {
    // Increased button padding by ~20%
    const baseStyle = "group relative inline-flex items-center justify-center overflow-hidden rounded-md px-12 py-6 text-sm md:text-base font-bold tracking-wide transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-black disabled:opacity-50 disabled:pointer-events-none uppercase";
    
    const variants = {
      primary: "bg-brand-navy border border-[#dfbd69]/30 text-[#fcf2bf] hover:bg-brand-navy-light shadow-lg hover:shadow-2xl hover:shadow-[#dfbd69]/10 focus-visible:ring-[#dfbd69]",
      secondary: "bg-gradient-gold-foil text-brand-black shadow-[0_0_20px_rgba(223,189,105,0.3)] hover:shadow-[0_0_40px_rgba(252,242,191,0.5)] focus-visible:ring-[#dfbd69]",
      outline: "glass-panel text-[#dfbd69] hover:bg-[#dfbd69]/10 hover:text-[#fcf2bf] px-8 py-3" // specific adjustment for outline variant
    };
    
    return (
      <button ref={ref} className={cn(baseStyle, variants[variant], breather && "animate-breathe", className)} {...props}>
        <span className="relative z-10 flex items-center justify-center gap-3">{children}</span>
        {variant === 'secondary' && (
          <div className="absolute inset-0 z-0 bg-white/20 w-1/2 -skew-x-[25deg] -translate-x-[150%] group-hover:animate-[shimmer_1s_forwards]"></div>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

function GradientDivider() {
  return (
    <div className="w-full flex justify-center py-16 relative z-20">
      <div className="w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-[#dfbd69]/40 to-transparent"></div>
    </div>
  );
}

// Highly stylized inline CTA for funnel progression
function InlineCTA({ title, subtitle, btnText }: { title: string, subtitle: string, btnText: string }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8 relative z-20">
      {/* Increased padding from p-8 md:p-12 to p-10 md:p-16 */}
      <motion.div {...fadeUp} className="glass-panel border-gradient-gold rounded-2xl p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#dfbd69]/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 group-hover:bg-[#dfbd69]/20 transition-colors duration-700"></div>
        <div className="relative z-10 text-center md:text-left">
          <p className="text-[#dfbd69] font-mono text-xs uppercase tracking-[0.3em] mb-4 opacity-90">{subtitle}</p>
          <h3 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white font-bold">{title}</h3>
        </div>
        <div className="relative z-10 w-full md:w-auto shrink-0 mt-6 md:mt-0">
          <Button
            variant="secondary"
            className="w-full md:w-auto whitespace-nowrap shadow-[0_0_30px_rgba(223,189,105,0.2)]"
            onClick={() => window.open(ctaUrl, "_blank", "noopener,noreferrer")}
          >
            {btnText} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// -------------------------------------------------------------
// NAV HEADER (STICKY)
// -------------------------------------------------------------
function Header() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    return scrollY.onChange((latest) => {
      setIsScrolled(latest > 100);
    });
  }, [scrollY]);

  return (
    <header className={cn(
      "fixed top-0 z-50 w-full transition-all duration-500",
      isScrolled ? "bg-brand-obsidian/90 backdrop-blur-xl border-b border-[#dfbd69]/10 py-5" : "bg-transparent py-8 md:py-12"
    )}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 md:px-12">
        <div className="cursor-pointer select-none">
          <img src={naiduLogo} alt="Naidu Property Consulting Services" className="h-[74px] md:h-[90px] lg:h-[106px] w-auto max-w-[90vw] object-contain" />
        </div>
        <AnimatePresence>
          {isScrolled && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Button
                variant="secondary"
                className="px-8 py-3 text-xs tracking-widest hidden sm:flex shadow-[0_0_15px_rgba(223,189,105,0.2)]"
                onClick={() => window.open(ctaUrl, "_blank", "noopener,noreferrer")}
              >
                Take The Quiz
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// -------------------------------------------------------------
// PAGE SECTIONS
// -------------------------------------------------------------

function Hero() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <section className="relative overflow-hidden bg-brand-obsidian min-h-screen flex items-center justify-center pt-40 pb-28 border-b border-[#dfbd69]/10 bg-scanline">
      {/* Immersive Grid & Lighting */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_20%,transparent_100%)] opacity-40"></div>
      
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[600px] bg-[#dfbd69]/5 rounded-[100%] blur-[150px] pointer-events-none"></div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 md:px-12 text-center flex flex-col items-center">
        
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} className="mb-12">
          {/* Increased padding from px-6 py-2.5 to px-8 py-3.5 */}
          <div className="inline-flex items-center gap-3 rounded-full glass-panel px-8 py-3.5 border border-[#dfbd69]/30 shadow-[0_0_30px_rgba(223,189,105,0.1)]">
            <Lock className="w-4 h-4 text-[#dfbd69]" />
            <span className="text-[11px] font-mono font-semibold text-[#fcf2bf] tracking-[0.3em] uppercase">AUSTRALIAN-PATENTED FRAMEWORK</span>
          </div>
        </motion.div>
        
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} className="font-serif text-5xl md:text-7xl lg:text-[84px] font-bold tracking-tight text-white leading-[1.05] mb-10">
          How To Build A Scalable Property Portfolio <br className="hidden lg:block"/>
          <span className="text-gradient-gold italic font-light drop-shadow-[0_0_40px_rgba(223,189,105,0.2)]">Without The Guesswork.</span>
        </motion.h1>
        
        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-3xl text-xl md:text-2xl text-slate-300 mb-16 leading-relaxed font-light measure-tight">
          Stop relying on generic advice and emotional purchases. Discover the patented, data-driven framework that engineers your exact financial position into a clear, scalable roadmap—whether you are buying your first investment or your fifth.
        </motion.p>

        {/* Cinematic VSL Container */}
        <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-5xl mx-auto relative group mb-24 z-20">
          
          <div className="absolute -inset-1 bg-gradient-gold-foil rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative glass-panel rounded-2xl overflow-hidden aspect-video border-gradient-gold corner-brackets group-hover:shadow-[0_0_80px_rgba(223,189,105,0.2)] transition-shadow duration-700 bg-brand-obsidian">
            <div className="absolute inset-0 bg-brand-black/10"></div>
            <video
              className="relative z-[1] h-full w-full object-cover bg-brand-black"
              controls
              playsInline
              preload="metadata"
              poster={mainVslPosterUrl}
              crossOrigin="anonymous"
              onError={() => setVideoFailed(true)}
            >
              <source src={mainVslVideoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-brand-black/20 via-transparent to-brand-obsidian/10"></div>

            <div className="pointer-events-none absolute top-6 left-6 flex items-center gap-3 z-[3]">
              <div className="flex items-center gap-2 bg-red-600/20 text-red-400 text-xs font-mono font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-sm border border-red-500/30 backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                Executive Briefing
              </div>
            </div>



            {videoFailed && (
              <div className="absolute inset-0 z-[4] flex items-center justify-center bg-brand-black/70 p-6">
                <div className="max-w-xl text-center">
                  <p className="text-white font-serif text-2xl mb-3">Video unavailable in this browser session.</p>
                  <a href={mainVslVideoUrl} target="_blank" rel="noreferrer" className="text-[#dfbd69] underline underline-offset-4">Open the video directly</a>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-8 left-8 right-8 flex justify-between items-end z-[3]">
              <div className="text-left">
                <p className="text-white font-serif font-bold text-3xl drop-shadow-lg mb-3">The "Engineered Portfolio" Secret</p>
                <div className="flex items-center gap-4 text-[#dfbd69] font-mono text-xs uppercase tracking-[0.2em]">
                  <span className="flex items-center gap-1"><Crosshair className="w-3 h-3"/> Strategic Overview</span>
                  <span className="opacity-50">|</span>
                  <span>Main VSL</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Area */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.8 }} className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-6">
          <Button
            variant="secondary"
            breather
            className="w-full md:w-auto text-xl px-16 py-8 rounded-xl shadow-[0_0_40px_rgba(223,189,105,0.2)]"
            onClick={() => window.open(ctaUrl, "_blank", "noopener,noreferrer")}
          >
            Take The 4-Question Placement Quiz <ArrowRight className="w-6 h-6 ml-2" />
          </Button>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase tracking-[0.1em] pt-4">
            <Lock className="w-3 h-3" /> Step 1: Rapid 4-question quiz to see if you qualify.
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SocialProof() {
  const logos = ['Forbes', 'Bloomberg', 'AFR', 'Property Investor'];
  
  return (
    // Increased padding from py-12 to py-16
    <section className="py-16 border-b border-[#dfbd69]/10 bg-brand-navy-light/20 relative z-10">
       <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20">
          <p className="text-[#dfbd69] font-mono text-xs uppercase tracking-[0.3em] opacity-80 whitespace-nowrap">As Featured In</p>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-20 opacity-40 grayscale contrast-200">
             <span className="font-serif text-2xl font-bold text-white tracking-wider">FORBES</span>
             <span className="font-sans text-2xl font-black text-white tracking-tighter">Bloomberg</span>
             <span className="font-serif text-2xl font-bold text-white italic">The AFR</span>
             <span className="font-sans text-xl font-bold text-white uppercase tracking-widest">Property</span>
          </div>
       </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section className="py-40 relative bg-brand-obsidian">
      {/* Decorative lines */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-40 bg-gradient-to-b from-[#dfbd69]/40 to-transparent"></div>
      
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <motion.div {...fadeUp} className="mb-14">
          <Crosshair className="w-14 h-14 text-[#dfbd69] mx-auto opacity-50 mb-8" />
          <h2 className="font-serif text-4xl md:text-6xl font-bold mb-12 leading-tight">
            The "Old Way" Of Property Investing Is A Trap.
          </h2>
        </motion.div>
        
        <motion.div {...fadeUp} className="space-y-10 text-xl md:text-2xl text-slate-300 font-light leading-relaxed mb-28 measure-tight mx-auto">
          <p>Most investors don't fail because they don't try. They fail because they deploy massive capital into "assets" <strong className="text-[#dfbd69] font-medium block mt-3 text-3xl">based purely on emotion and generic advice.</strong></p>
          <p className="text-lg md:text-xl text-slate-400 pt-8">
            Property investing isn’t about luck. And it isn't about scrolling online to find something that <em className="text-white italic">looks</em> like a good deal.
          </p>
          <p className="text-lg md:text-xl text-slate-400">
            It’s about executing the exact right acquisition, in the exact right sequence, using an institutional-grade framework.
          </p>
        </motion.div>

        {/* Increased padding from p-10 md:p-16 to p-12 md:p-24 */}
        <motion.div {...fadeUp} className="glass-panel border-gradient-gold rounded-2xl p-12 md:p-24 lg:p-24 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-red-900/10 to-transparent"></div>
          
          <div className="flex items-center justify-center gap-4 mb-10">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <p className="text-red-400 font-mono font-bold uppercase tracking-[0.2em] text-sm">The Reality Check</p>
          </div>
          
          <p className="text-2xl md:text-4xl lg:text-5xl font-serif text-white leading-relaxed">
            The hidden truth? A single poorly structured "good deal" will completely strangle your borrowing capacity and trap your equity for a decade.
          </p>
          <div className="w-20 h-px bg-[#dfbd69]/40 mx-auto mt-12 mb-10"></div>
          <p className="text-[#dfbd69] italic text-2xl font-serif">This is exactly how portfolios die.</p>
        </motion.div>
      </div>
    </section>
  );
}

function Positioning() {
  return (
    <section className="py-40 bg-brand-navy relative overflow-hidden border-t border-[#dfbd69]/10">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#dfbd69]/5 rounded-full blur-[100px] mix-blend-screen pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-20 lg:gap-28 items-center">
        <motion.div {...fadeUp}>
          {/* Increased padding here from px-4 py-1.5 to px-6 py-2.5 */}
          <div className="inline-flex items-center gap-3 border border-[#dfbd69]/30 rounded-full px-6 py-2.5 mb-10 bg-[#dfbd69]/5">
            <Fingerprint className="w-4 h-4 text-[#dfbd69]" />
            <span className="text-[#dfbd69] font-mono text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold">THE NEW OPPORTUNITY</span>
          </div>
          
          <h2 className="font-serif text-4xl md:text-5xl lg:text-7xl font-bold text-white mb-12 leading-[1.05]">
            The Secret: Our Australian-Patented Framework.
          </h2>
          
          <div className="space-y-8 text-xl text-slate-300 font-light leading-relaxed">
            <p>Generic advice creates average wealth. You don't need another generic buyer's agent. <strong className="text-white">You need a proven system.</strong></p>
            {/* Increased padding from p-8 my-10 to p-12 my-12 */}
            <div className="p-10 md:p-12 my-12 glass-panel border-l-4 border-l-[#dfbd69] bg-brand-obsidian/40 relative corner-brackets">
              <p className="font-medium text-white italic font-serif text-2xl md:text-3xl leading-snug">
                Every decision we make leverages real-time data, strategic foresight, and an officially patented algorithm tailored precisely to your situation.
              </p>
            </div>
            <p className="text-lg md:text-xl text-slate-400">Because no two investors possess the same leverage. And no two portfolios should scale the same way.</p>
          </div>
        </motion.div>
        
        {/* Increased padding from p-10 md:p-14 to p-12 md:p-20 */}
        <motion.div {...fadeUp} className="glass-panel p-12 md:p-20 lg:p-24 rounded-2xl border-gradient-gold shadow-[0_30px_60px_rgba(0,0,0,0.4)] relative">
          <div className="absolute -top-8 -right-8 w-20 h-20 bg-brand-obsidian border border-[#dfbd69]/30 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(223,189,105,0.2)]">
            <Activity className="text-[#dfbd69] w-8 h-8" />
          </div>
          <p className="font-mono text-[#dfbd69] text-sm uppercase tracking-[0.2em] mb-8 border-b border-[#dfbd69]/20 pb-5">Internal Insight</p>
          <p className="font-serif text-3xl md:text-4xl text-slate-200 leading-relaxed italic">
            "This is why clients come to us after trying it themselves — realizing how devastatingly easy it is to make costly mistakes without a rigid, mathematical blueprint guiding them."
          </p>
          <div className="mt-12 flex items-center gap-5">
             <div className="w-20 h-20 rounded-full bg-[#dfbd69]/20 border border-[#dfbd69]/40 overflow-hidden shrink-0">
               <img
                 src={leadStrategistImage}
                 alt="Rugesh Naidu"
                 className="w-full h-full object-cover"
               />
             </div>
             <div>
               <p className="text-white font-bold text-base tracking-wide uppercase">Founder</p>
               <p className="text-slate-300 font-semibold text-sm tracking-wide mt-1">Rugesh Naidu</p>
               <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1.5">NPC Services</p>
             </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function CaseStudies() {
  const cases = [
    {
      title: "First-Time Investor",
      code: "OP-DELTA",
      issues: ["Unverified borrowing capacity limits", "No clear acquisition pipeline", "Vulnerable to retail 'trap' assets"],
      outcome: "Structured capacity. Acquired first asset inherently engineered to trigger a continuous scaling roadmap.",
      icon: <Target className="w-7 h-7" />
    },
    {
      title: "Stuck Portfolio",
      code: "OP-ECHO",
      issues: ["Held equity but lacked serviceability", "Dead equity trapped by poor initial sequencing", "Growth algorithm stalled completely"],
      outcome: "Restructured debt facilities. Unlocked dormant equity to accelerate the next acquisition cycle safely.",
      icon: <TrendingUp className="w-7 h-7" />
    },
    {
      title: "High Liquidity, No Plan",
      code: "OP-SIGMA",
      issues: ["High liquidity, intense tax burden", "Random, emotional asset selection patterns", "Highly capital-inefficient setup"],
      outcome: "Shifted from impulsive buying to strategic, tax-optimized portfolio building targeting asymmetric compounded growth.",
      icon: <Briefcase className="w-7 h-7" />
    }
  ];

  return (
    <section className="py-40 bg-brand-obsidian relative border-t border-b border-[#dfbd69]/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-4xl mx-auto mb-24">
          {/* Increased margin and sizes */}
          <motion.p {...fadeUp} className="text-[#dfbd69] font-mono font-bold uppercase tracking-[0.3em] text-[11px] mb-8 flex items-center justify-center gap-4">
             <span className="w-12 h-px bg-[#dfbd69]/50"></span>
             It's Not Just Theory. Here's The Proof.
             <span className="w-12 h-px bg-[#dfbd69]/50"></span>
          </motion.p>
          <motion.h2 {...fadeUp} className="font-serif text-5xl md:text-7xl font-bold text-white mb-8">
            Execution In Practice.
          </motion.h2>
        </div>

        <motion.div {...staggerContainer} className="grid lg:grid-cols-3 gap-10 lg:gap-12">
          {cases.map((c, i) => (
            // Increased padding from p-8 md:p-10 to p-10 md:p-14 lg:p-16
            <motion.div key={i} {...staggerItem} className="glass-panel p-10 md:p-14 lg:p-16 rounded-xl relative group overflow-hidden corner-brackets">
              {/* Scanline hover effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#dfbd69]/5 to-transparent -translate-y-[200%] group-hover:animate-[scanline_2s_ease-in-out_infinite]"></div>
              
              <div className="flex justify-between items-start mb-12 border-b border-[#dfbd69]/10 pb-8 relative z-10">
                <div className="w-16 h-16 bg-brand-black border border-[#dfbd69]/30 rounded-lg flex items-center justify-center text-[#dfbd69] shadow-inner">
                  {c.icon}
                </div>
                <div className="text-right">
                   <p className="font-mono text-[11px] text-slate-500 uppercase tracking-widest mb-1.5">Dossier ID</p>
                   <p className="font-mono text-sm text-[#dfbd69] tracking-widest font-bold">{c.code}</p>
                </div>
              </div>
              
              <h3 className="font-serif text-3xl lg:text-4xl font-bold text-white mb-10 relative z-10">{c.title}</h3>
              
              <div className="mb-12 relative z-10">
                 <p className="font-mono text-[11px] text-slate-500 uppercase tracking-widest mb-5">Initial State Diagnostics</p>
                <ul className="space-y-5">
                  {c.issues.map((issue, j) => (
                    <li key={j} className="flex items-start gap-4 text-slate-300 text-sm md:text-base">
                      <div className="w-1 h-3.5 bg-red-900/50 border border-red-500/50 mt-1 flex-shrink-0" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Increased padding from p-6 to p-8 */}
              <div className="bg-brand-navy p-8 rounded-lg border border-[#dfbd69]/20 relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#dfbd69] shadow-[0_0_8px_rgba(223,189,105,0.8)]"></div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#dfbd69]">Resolution Protocol</p>
                </div>
                <p className="text-white font-serif italic text-xl leading-snug">{c.outcome}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section className="py-40 bg-brand-navy relative overflow-hidden">
      {/* Heavy grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] [background-size:32px_32px] opacity-30"></div>

      <div className="max-w-5xl mx-auto px-6 relative z-10">
        <motion.div {...fadeUp} className="text-center mb-32">
          <h2 className="font-serif text-5xl md:text-7xl font-bold text-white mb-8">
            The Architecture Of <br className="hidden md:block"/><span className="text-gradient-gold">Precision</span>
          </h2>
        </motion.div>

        <div className="space-y-12 md:space-y-16 relative">
          {/* Connector Line */}
          <div className="absolute top-0 bottom-0 left-10 md:left-1/2 md:-translate-x-px w-px bg-gradient-to-b from-transparent via-[#dfbd69]/30 to-transparent"></div>
          
          {/* Step 1 */}
          <motion.div {...fadeUp} className="relative flex flex-col md:flex-row items-start md:items-center justify-between group pt-6">
            <div className="absolute left-10 md:left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-black border-2 border-[#dfbd69] z-10 shadow-[0_0_15px_rgba(223,189,105,0.6)] group-hover:scale-150 transition-transform duration-500"></div>
            
            <div className="w-full pl-24 md:pl-0 md:w-[calc(50%-4rem)] md:pr-16 text-left md:text-right">
              <p className="font-mono text-sm text-[#dfbd69] uppercase tracking-[0.3em] font-bold mb-4">Phase 01</p>
              <h3 className="font-serif text-4xl font-bold text-white mb-5">The 4-Question Diagnostic Quiz</h3>
              <p className="text-slate-400 font-light text-lg mb-4">It starts with a simple 4-question quiz. If you qualify, we move to a Discovery Call where we mathematically assess your borrowing capacity and strategic objectives. <strong className="text-white">Without a hyper-clear target, strategy is impossible.</strong></p>
            </div>
            
            <div className="hidden md:block w-[calc(50%-4rem)]"></div>
          </motion.div>

          {/* Step 2 */}
          <motion.div {...fadeUp} className="relative flex flex-col md:flex-row-reverse items-start md:items-center justify-between group pt-16">
            <div className="absolute left-10 md:left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-black border-2 border-[#dfbd69] z-10 shadow-[0_0_15px_rgba(223,189,105,0.6)] group-hover:scale-150 transition-transform duration-500"></div>
            
            <div className="w-full pl-24 md:pl-0 md:w-[calc(50%-4rem)] md:pl-16 text-left">
              <p className="font-mono text-sm text-[#dfbd69] uppercase tracking-[0.3em] font-bold mb-4">Phase 02</p>
              <h3 className="font-serif text-4xl font-bold text-white mb-5">Leverage & Acquisition Sequencing</h3>
              <p className="text-slate-400 font-light text-lg mb-5">We plot the geometry of your portfolio. We define exactly how today's acquisition secures the leverage required for tomorrow's.</p>
              <div className="bg-brand-black/40 border-l-2 border-red-500/50 p-4 rounded-r-md">
                <p className="text-red-400 text-sm font-semibold">Poor sequencing permanently destroys borrowing capacity. We eliminate this risk mathematically.</p>
              </div>
            </div>
            
            <div className="hidden md:block w-[calc(50%-4rem)]"></div>
          </motion.div>

          {/* Step 3 */}
          <motion.div {...fadeUp} className="relative flex flex-col md:flex-row items-start md:items-center justify-between group pt-16">
            <div className="absolute left-10 md:left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand-black border-2 border-[#dfbd69] z-10 shadow-[0_0_15px_rgba(223,189,105,0.6)] group-hover:scale-150 transition-transform duration-500"></div>
            
            <div className="w-full pl-24 md:pl-0 md:w-[calc(50%-4rem)] md:pr-16 text-left md:text-right">
              <p className="font-mono text-sm text-[#dfbd69] uppercase tracking-[0.3em] font-bold mb-4">Phase 03</p>
              <h3 className="font-serif text-4xl font-bold text-white mb-5">Algorithmic Asset Selection</h3>
              <p className="text-slate-400 font-light text-lg mb-6">We don't buy on feeling or retail hype. We deploy capital based strictly on comparable sales logic, yield velocity, and micro-market disruption triggers.</p>
              <p className="text-[#dfbd69] text-base font-mono tracking-widest uppercase items-center justify-start md:justify-end gap-3 flex"><Target className="w-5 h-5"/> 100% Data-Driven.</p>
            </div>
            
            <div className="hidden md:block w-[calc(50%-4rem)]"></div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function CoreOffer() {
  return (
    <section className="py-40 bg-brand-obsidian relative">
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[600px] h-[600px] bg-[#dfbd69]/5 rounded-full blur-[150px] pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-24 items-center relative z-10">
        <motion.div {...fadeUp}>
           {/* Increased padding from px-5 py-2.5 to px-6 py-3.5 */}
           <div className="inline-flex items-center gap-3 px-6 py-3.5 rounded-sm border border-[#dfbd69]/30 bg-[#dfbd69]/5 backdrop-blur-md mb-10">
            <FileText className="w-5 h-5 text-[#dfbd69]" /> 
            <span className="text-[#dfbd69] font-mono text-sm uppercase tracking-[0.2em] font-bold">The Blueprint</span>
          </div>
          <h2 className="font-serif text-5xl md:text-6xl font-bold mb-10 leading-tight text-white">
            The Deliverable: <br/><span className="text-gradient-gold">Asymmetric Clarity.</span>
          </h2>
          <p className="text-xl md:text-2xl text-slate-300 leading-relaxed mb-12 font-light">
            You receive a comprehensive, data-backed masterplan engineered via our proprietary framework. This is the exact institutional-grade playbook required to acquire your next asset.
          </p>

           <div className="grid sm:grid-cols-2 gap-6">
              {[
                'Curated property shortlist', 
                'Micro-market intelligence', 
                '10-Year yield modeling', 
                'Capital acceleration indicators', 
                'Complete cash flow algorithms', 
                'Risk mitigation architecture'
              ].map((item, i) => (
                // Increased padding from p-4 to p-6 md:p-8
                <div key={i} className="flex items-center gap-4 glass-panel p-6 md:p-8 rounded-xl shadow-lg">
                  <CheckCircle className="w-6 h-6 text-[#dfbd69] flex-shrink-0" />
                  <span className="text-base font-semibold text-slate-200 leading-snug">{item}</span>
                </div>
              ))}
            </div>
        </motion.div>

        <motion.div {...fadeUp} className="relative mt-8 lg:mt-0">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#dfbd69]/20 to-transparent rounded-2xl transform rotate-subtitle -rotate-2 scale-105 blur-lg mix-blend-screen"></div>
          {/* Increased padding from p-12 md:p-16 to p-16 md:p-24 */}
          <div className="glass-panel border-gradient-gold p-16 md:p-24 rounded-2xl relative shadow-2xl overflow-hidden corner-brackets">
            <div className="absolute top-0 right-0 p-10 opacity-20">
               <ShieldCheck className="w-40 h-40 text-white" />
            </div>
            
            <h3 className="font-serif text-4xl lg:text-5xl text-white mb-8 relative z-10 leading-tight">Institutional precision for private wealth.</h3>
            <p className="text-slate-300 mb-12 leading-relaxed text-xl font-light relative z-10">
              This cannot be replicated with a weekend of online searches. It is an enterprise-level decision-making network applied directly to your personal capital.
            </p>
            <div className="pt-10 border-t border-white/10 relative z-10">
              <p className="font-serif text-3xl md:text-4xl italic text-[#dfbd69] leading-tight drop-shadow-md">
                "This is the exact moment our clients realize what they've been missing in the retail market."
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function AuthorityClosing() {
   return (
    <section className="py-48 bg-brand-navy border-y border-[#dfbd69]/20 relative overflow-hidden text-center z-10">
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(223,189,105,0.08)_0%,transparent_60%)] pointer-events-none"></div>
       <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.h2 {...fadeUp} className="font-serif text-5xl md:text-7xl font-bold text-white mb-10 leading-tight">
            The Divide Between Retail Buyers & Elite Portfolios.
          </motion.h2>
          <motion.p {...fadeUp} className="text-xl md:text-2xl lg:text-3xl text-slate-300 font-light mb-20 max-w-3xl mx-auto leading-relaxed">
            This patented methodology is highly effective, but we can only guide a limited roster of new clients each month. We optimize exclusively for aggressive, structured results—not volume.
          </motion.p>
          <motion.div {...fadeUp}>
            <Button
              variant="secondary"
              breather
              className="text-xl md:text-2xl px-16 py-8 rounded-2xl shadow-2xl"
              onClick={() => window.open(ctaUrl, "_blank", "noopener,noreferrer")}
            >
               Step 1: Take The 4-Question Quiz <ArrowRight className="ml-4 w-7 h-7" />
            </Button>
            <p className="mt-8 text-sm md:text-base text-[#dfbd69] font-mono tracking-widest uppercase font-bold">* Spaces for Discovery Calls are strictly limited.</p>
          </motion.div>
       </div>
    </section>
   )
}

function FinalFooter() {
  return (
    <footer className="bg-brand-black text-slate-500 py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-10">
          <div>
            <img src={naiduLogo} alt="Naidu Property Consulting Services" className="h-[74px] md:h-[90px] lg:h-[106px] w-auto max-w-[90vw] object-contain opacity-90" />
          </div>
          <p className="text-base font-mono tracking-widest uppercase">© {new Date().getFullYear()} NPC Services. Secure & Confidential.</p>
          <div className="flex gap-10 text-sm font-mono uppercase tracking-widest">
            <a href="#" className="hover:text-[#dfbd69] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#dfbd69] transition-colors">Terms</a>
          </div>
        </div>
      </footer>
  )
}

// -------------------------------------------------------------
// MAIN APP COMPONENT
// -------------------------------------------------------------

export default function App() {
  return (
    <div className="min-h-screen bg-brand-black font-sans text-slate-200 selection:bg-[#dfbd69] selection:text-brand-black antialiased overflow-x-hidden">
      <Header />

      <main>
        <Hero />
        <SocialProof />
        <ProblemSection />
        
        <GradientDivider />
        <InlineCTA 
          title="Ready To See The Patented Framework In Action?" 
          subtitle="Take The First Step" 
          btnText="Start The 4-Question Quiz" 
        />
        <GradientDivider />

        <Positioning />
        <CaseStudies />
        
        <GradientDivider />
        <InlineCTA 
          title="Want This Exact Methodology Applied To Your Goals?" 
          subtitle="Portfolio Architecture" 
          btnText="Take The Quiz & Apply" 
        />
        <GradientDivider />

        <Process />
        <CoreOffer />
        <AuthorityClosing />
      </main>

      <FinalFooter />
    </div>
  );
}
