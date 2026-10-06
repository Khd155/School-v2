import type { SchoolInfo } from "../shared/types";

/**
 * Official-style header for public pages: logos beside the school name.
 * Without uploaded logos it stays purely typographic (no placeholders).
 */
export function SiteHeader({ school }: { school: SchoolInfo }) {
  const { ministry, school: schoolLogo } = school.logos;
  const hasLogos = !!(ministry || schoolLogo);
  return (
    <header class={`site-header${hasLogos ? " has-logos" : ""}`}>
      <div class="site-header-inner">
        {hasLogos && (
          <div class="site-header-logos">
            {ministry && <img src={ministry} alt="شعار وزارة التعليم" />}
            {schoolLogo && <img src={schoolLogo} alt={`شعار ${school.schoolName}`} />}
          </div>
        )}
        <div class="site-header-text">
          <p class="site-header-school">{school.schoolName}</p>
          {school.educationOffice && <p class="site-header-office">{school.educationOffice}</p>}
        </div>
      </div>
    </header>
  );
}
