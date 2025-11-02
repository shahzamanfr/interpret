import React, { useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

interface AboutSectionProps {
  videoUrl?: string;
  posterUrl?: string;
}

const benefits = [
  {
    title: "Explain with confidence",
    desc: "Practice concise, structured answers on top of compelling visuals.",
  },
  {
    title: "Get feedback that moves you",
    desc: "Actionable, specific suggestions—not generic tips or filler.",
  },
  {
    title: "Level up with strategies",
    desc: "Learn repeatable techniques you can apply in interviews and talks.",
  },
];

const AboutSection: React.FC<AboutSectionProps> = ({
  videoUrl = "/images/AI_Analyzes_Communication_Offers_Suggestions.mp4",
  posterUrl = "https://images.unsplash.com/photo-1556157382-97eda2d62296?q=80&w=1600&auto=format&fit=crop",
}) => {
  const { theme } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section id="about" className="py-20">
      <div
        data-scroll-animate
        className={`rounded-3xl border p-8 ${
          theme === "dark"
            ? "border-gray-800 bg-gradient-to-br from-gray-950 via-black to-gray-950"
            : "border-gray-300 bg-gradient-to-br from-gray-50 via-white to-gray-50"
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-6 space-y-5">
            <p
              className={`text-xs uppercase tracking-[0.35em] ${
                theme === "dark" ? "text-gray-600" : "text-gray-900"
              }`}
            >
              About
            </p>
            <h3
              className={`text-3xl sm:text-4xl font-semibold tracking-tight ${
                theme === "dark" ? "text-white" : "text-black"
              }`}
            >
              Explain better. Learn faster.
            </h3>
            <p
              className={`text-base max-w-2xl ${
                theme === "dark" ? "text-gray-400" : "text-gray-900"
              }`}
            >
              You bring your ideas—we bring the coaching. Describe vivid scenes,
              get targeted feedback, and turn your thinking into crisp,
              compelling explanations users and teams can trust.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className={`group rounded-2xl border p-4 transition-transform duration-300 hover:-translate-y-0.5 ${
                    theme === "dark"
                      ? "border-gray-800 bg-gray-950/60"
                      : "border-gray-300 bg-gray-50"
                  }`}
                >
                  <h4
                    className={`font-semibold tracking-tight ${
                      theme === "dark" ? "text-white" : "text-black"
                    }`}
                  >
                    {b.title}
                  </h4>
                  <p
                    className={`text-xs mt-1 leading-relaxed ${
                      theme === "dark" ? "text-gray-400" : "text-gray-900"
                    }`}
                  >
                    {b.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-6">
            <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
              <div className="relative overflow-hidden rounded-2xl">
                <video
                  ref={videoRef}
                  className="block h-full w-full rounded-2xl scale-110"
                  poster={posterUrl}
                  controls
                  autoPlay
                  loop
                  muted
                >
                  <source src={videoUrl} type="video/mp4" />
                </video>
                {!isPlaying && (
                  <button
                    type="button"
                    onClick={handlePlay}
                    className="absolute inset-0 m-auto h-14 w-14 rounded-full bg-gray-800/95 text-white grid place-items-center shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] hover:scale-[1.03] transition-transform duration-200"
                    aria-label="Play video"
                  >
                    ▶
                  </button>
                )}
              </div>
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_200px_at_85%_20%,rgba(255,255,255,0.06),transparent_70%)]"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
