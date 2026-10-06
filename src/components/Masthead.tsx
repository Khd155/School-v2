import type { SchoolInfo } from "@/lib/types";

type Props = {
  school: SchoolInfo;
  /** Heading level for the school name; the report uses a <p> since the document title is the h1. */
  as?: "h1" | "p";
};

/**
 * Logos are shown only when uploaded. With none, the masthead is purely
 * typographic — no placeholders or reserved space.
 */
export function Masthead({ school, as: Tag = "p" }: Props) {
  const { ministry, school: schoolLogo } = school.logos;
  const hasLogos = !!(ministry || schoolLogo);

  return (
    <header className="masthead">
      {hasLogos && (
        <div className="masthead-logos">
          {ministry && <img src={ministry} alt="شعار وزارة التعليم" />}
          {schoolLogo && <img src={schoolLogo} alt={`شعار ${school.schoolName}`} />}
        </div>
      )}
      <Tag className="masthead-school">{school.schoolName}</Tag>
      {school.educationOffice && <p className="masthead-office">{school.educationOffice}</p>}
      <hr className="masthead-rule" />
    </header>
  );
}
