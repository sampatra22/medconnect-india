import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LoginModal } from "@/components/auth/login-modal";
import {
  Stethoscope,
  Briefcase,
  Search,
  Building2,
  Newspaper,
  Star,
  Users,
  MapPin,
  Smartphone,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              MedConnect <span className="text-emerald-600">India</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link href="/doctors">Doctors</Link>
            <Link href="/jobs">Jobs</Link>
            <Link href="/chemists">Chemists</Link>
            <Link href="/news">News</Link>
            <Link href="/learning">Learning</Link>
          </nav>
          <div className="flex items-center gap-3">
            <LoginModal />
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <Badge className="mb-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            India&apos;s Pharma Ecosystem, Connected
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white leading-tight">
            One Platform for MRs, Doctors
            <br />
            <span className="text-blue-600">& Pharma Companies</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Find doctors in real time, discover jobs, track visits, and grow
            your pharma career — all in one place.
          </p>

          {/* Search bars */}
          <div className="mt-10 max-w-3xl mx-auto grid gap-4 sm:grid-cols-2">
            <Card className="shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <Stethoscope className="h-5 w-5 text-blue-600 shrink-0" />
                <Input
                  placeholder="Search doctors by name or specialty"
                  className="border-0 focus-visible:ring-0 shadow-none"
                />
                <Button size="icon" className="bg-blue-600 hover:bg-blue-700 shrink-0">
                  <Search className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-emerald-600 shrink-0" />
                <Input
                  placeholder="Search jobs by title or territory"
                  className="border-0 focus-visible:ring-0 shadow-none"
                />
                <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                  <Search className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Doctors Listed", value: "12,000+" },
            { label: "Active MRs", value: "8,500+" },
            { label: "Pharma Partners", value: "300+" },
            { label: "Jobs Posted", value: "1,200+" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Pharma Companies */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            Featured Pharma Companies
          </h2>
          <Link href="/companies" className="text-sm text-blue-600 flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["Sun Pharma", "Cipla", "Dr. Reddy's", "Lupin"].map((name) => (
            <Card key={name} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 flex flex-col items-center gap-3">
                <Avatar className="h-14 w-14 bg-blue-100">
                  <AvatarFallback className="text-blue-700 font-semibold">
                    {name[0]}
                  </AvatarFallback>
                </Avatar>
                <p className="font-medium text-slate-800 dark:text-slate-100 text-center">
                  {name}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Medical News */}
      <section className="bg-slate-50 dark:bg-slate-900 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-8">
            <Newspaper className="h-6 w-6 text-emerald-600" />
            Latest Medical News
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <Badge variant="secondary" className="mb-3">
                    Drug Launch
                  </Badge>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    New oncology drug approved by CDSCO
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    A brief summary of the announcement will appear here once
                    the News module is connected to the database.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-8">
          <Star className="h-6 w-6 text-yellow-500" />
          What Our Users Say
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: "Rohan S.", role: "Medical Representative" },
            { name: "Dr. Priya M.", role: "Cardiologist" },
            { name: "Ankit Pharma", role: "Pharma Company" },
          ].map((t) => (
            <Card key={t.name}>
              <CardContent className="p-6">
                <div className="flex gap-1 text-yellow-500 mb-3">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} className="h-4 w-4 fill-yellow-500" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  &ldquo;MedConnect India has made it so much easier to plan visits
                  and stay on top of doctor availability.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{t.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {t.name}
                    </p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Download App */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-white text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2 justify-center md:justify-start">
              <Smartphone className="h-7 w-7" />
              Take MedConnect India Everywhere
            </h2>
            <p className="mt-2 text-blue-100">
              Download the app to manage visits, track targets, and connect
              on the go.
            </p>
          </div>
          <div className="flex gap-4">
            <Button className="bg-white text-blue-700 hover:bg-blue-50">
              App Store
            </Button>
            <Button className="bg-white text-blue-700 hover:bg-blue-50">
              Google Play
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope className="h-6 w-6 text-blue-400" />
              <span className="text-white font-bold">MedConnect India</span>
            </div>
            <p className="text-sm text-slate-400">
              Connecting India&apos;s pharmaceutical ecosystem — MRs, doctors,
              chemists, and companies, in one place.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/doctors">Doctor Directory</Link></li>
              <li><Link href="/jobs">Job Portal</Link></li>
              <li><Link href="/chemists">Chemist Directory</Link></li>
              <li><Link href="/learning">Learning Center</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/careers">Careers</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Contact
            </h4>
            <p className="text-sm text-slate-400">
              Kolkata, West Bengal, India
              <br />
              support@medconnectindia.com
            </p>
          </div>
        </div>
        <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Users className="h-4 w-4" />
          © 2026 MedConnect India. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
