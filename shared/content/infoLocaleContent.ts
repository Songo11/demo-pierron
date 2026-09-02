import type { AppLocale } from '../core/config.ts';

export type InfoLocaleUi = {
  infoMenuTitle: string;
  projectInfoTitle: string;
  authorWordTitle: string;
  infoMenuSubtitle: string;
};

/** UI labels for Settings → Information (titles + subtitle). */
export const INFO_LOCALE_UI: Record<AppLocale, InfoLocaleUi> = {
  pl: {
    infoMenuTitle: 'Informacje',
    projectInfoTitle: 'Info o projekcie',
    authorWordTitle: 'Słowo od autora',
    infoMenuSubtitle: 'Projekt i słowo od autora',
  },
  en: {
    infoMenuTitle: 'Information',
    projectInfoTitle: 'Project info',
    authorWordTitle: 'A word from the author',
    infoMenuSubtitle: 'Project info and a note from the author',
  },
  de: {
    infoMenuTitle: 'Informationen',
    projectInfoTitle: 'Projektinfo',
    authorWordTitle: 'Ein Wort vom Autor',
    infoMenuSubtitle: 'Projektinfo und eine Notiz vom Autor',
  },
  es: {
    infoMenuTitle: 'Información',
    projectInfoTitle: 'Información del proyecto',
    authorWordTitle: 'Una palabra del autor',
    infoMenuSubtitle: 'Información del proyecto y una nota del autor',
  },
  pt: {
    infoMenuTitle: 'Informações',
    projectInfoTitle: 'Informações do projeto',
    authorWordTitle: 'Uma palavra do autor',
    infoMenuSubtitle: 'Informações do projeto e uma nota do autor',
  },
  ru: {
    infoMenuTitle: 'Информация',
    projectInfoTitle: 'Информация о проекте',
    authorWordTitle: 'Слово автора',
    infoMenuSubtitle: 'О проекте и слово автора',
  },
  zh: {
    infoMenuTitle: '信息',
    projectInfoTitle: '项目信息',
    authorWordTitle: '作者的话',
    infoMenuSubtitle: '项目信息与作者寄语',
  },
  ja: {
    infoMenuTitle: '情報',
    projectInfoTitle: 'プロジェクト情報',
    authorWordTitle: '作者より',
    infoMenuSubtitle: 'プロジェクト情報と作者からの言葉',
  },
  cs: {
    infoMenuTitle: 'Informace',
    projectInfoTitle: 'Informace o projektu',
    authorWordTitle: 'Slovo autora',
    infoMenuSubtitle: 'Informace o projektu a slovo autora',
  },
  sq: {
    infoMenuTitle: 'Informacion',
    projectInfoTitle: 'Info për projektin',
    authorWordTitle: 'Një fjalë nga autori',
    infoMenuSubtitle: 'Info projekti dhe një shënim nga autori',
  },
  sr: {
    infoMenuTitle: 'Informacije',
    projectInfoTitle: 'Informacije o projektu',
    authorWordTitle: 'Reč autora',
    infoMenuSubtitle: 'Informacije o projektu i reč autora',
  },
  fa: {
    infoMenuTitle: 'اطلاعات',
    projectInfoTitle: 'اطلاعات پروژه',
    authorWordTitle: 'سخنی از نویسنده',
    infoMenuSubtitle: 'اطلاعات پروژه و یادداشت نویسنده',
  },
  vi: {
    infoMenuTitle: 'Thông tin',
    projectInfoTitle: 'Thông tin dự án',
    authorWordTitle: 'Lời từ tác giả',
    infoMenuSubtitle: 'Thông tin dự án và lời từ tác giả',
  },
  ms: {
    infoMenuTitle: 'Maklumat',
    projectInfoTitle: 'Maklumat projek',
    authorWordTitle: 'Kata dari pengarang',
    infoMenuSubtitle: 'Maklumat projek dan nota dari pengarang',
  },
  ar: {
    infoMenuTitle: 'معلومات',
    projectInfoTitle: 'معلومات المشروع',
    authorWordTitle: 'كلمة من المؤلف',
    infoMenuSubtitle: 'معلومات المشروع وكلمة من المؤلف',
  },
  ro: {
    infoMenuTitle: 'Informații',
    projectInfoTitle: 'Informații proiect',
    authorWordTitle: 'Un cuvânt de la autor',
    infoMenuSubtitle: 'Informații despre proiect și un cuvânt de la autor',
  },
  fr: {
    infoMenuTitle: 'Informations',
    projectInfoTitle: 'Informations sur le projet',
    authorWordTitle: "Un mot de l'auteur",
    infoMenuSubtitle: "Informations sur le projet et un mot de l'auteur",
  },
  sv: {
    infoMenuTitle: 'Information',
    projectInfoTitle: 'Projektinfo',
    authorWordTitle: 'Ett ord från författaren',
    infoMenuSubtitle: 'Projektinfo och en notis från författaren',
  },
  fi: {
    infoMenuTitle: 'Tiedot',
    projectInfoTitle: 'Projektin tiedot',
    authorWordTitle: 'Sana tekijältä',
    infoMenuSubtitle: 'Projektin tiedot ja sana tekijältä',
  },
  hu: {
    infoMenuTitle: 'Információ',
    projectInfoTitle: 'Projektinformáció',
    authorWordTitle: 'Szó a szerzőtől',
    infoMenuSubtitle: 'Projektinformáció és egy megjegyzés a szerzőtől',
  },
  el: {
    infoMenuTitle: 'Πληροφορίες',
    projectInfoTitle: 'Πληροφορίες έργου',
    authorWordTitle: 'Μια λέξη από τον συγγραφέα',
    infoMenuSubtitle: 'Πληροφορίες έργου και σημείωμα από τον συγγραφέα',
  },
  bg: {
    infoMenuTitle: 'Информация',
    projectInfoTitle: 'Информация за проекта',
    authorWordTitle: 'Дума от автора',
    infoMenuSubtitle: 'Информация за проекта и дума от автора',
  },
  tr: {
    infoMenuTitle: 'Bilgi',
    projectInfoTitle: 'Proje bilgisi',
    authorWordTitle: 'Yazardan bir söz',
    infoMenuSubtitle: 'Proje bilgisi ve yazardan bir not',
  },
  hr: {
    infoMenuTitle: 'Informacije',
    projectInfoTitle: 'Informacije o projektu',
    authorWordTitle: 'Riječ autora',
    infoMenuSubtitle: 'Informacije o projektu i riječ autora',
  },
  no: {
    infoMenuTitle: 'Informasjon',
    projectInfoTitle: 'Prosjektinfo',
    authorWordTitle: 'Et ord fra forfatteren',
    infoMenuSubtitle: 'Prosjektinfo og et notat fra forfatteren',
  },
  ko: {
    infoMenuTitle: '정보',
    projectInfoTitle: '프로젝트 정보',
    authorWordTitle: '작성자의 말',
    infoMenuSubtitle: '프로젝트 정보와 작성자의 글',
  },
  sk: {
    infoMenuTitle: 'Informácie',
    projectInfoTitle: 'Informácie o projekte',
    authorWordTitle: 'Slovo od autora',
    infoMenuSubtitle: 'Informácie o projekte a slovo od autora',
  },
  lt: {
    infoMenuTitle: 'Informacija',
    projectInfoTitle: 'Projekto informacija',
    authorWordTitle: 'Autoriaus žodis',
    infoMenuSubtitle: 'Projekto informacija ir autoriaus žodis',
  },
  be: {
    infoMenuTitle: 'Інфармацыя',
    projectInfoTitle: 'Інфармацыя пра праект',
    authorWordTitle: 'Слова аўтара',
    infoMenuSubtitle: 'Інфармацыя пра праект і слова аўтара',
  },
  et: {
    infoMenuTitle: 'Teave',
    projectInfoTitle: 'Projekti info',
    authorWordTitle: 'Sõna autorilt',
    infoMenuSubtitle: 'Projekti info ja sõna autorilt',
  },
  md: {
    infoMenuTitle: 'Informații',
    projectInfoTitle: 'Informații proiect',
    authorWordTitle: 'Un cuvânt de la autor',
    infoMenuSubtitle: 'Informații despre proiect și un cuvânt de la autor',
  },
  it: {
    infoMenuTitle: 'Informazioni',
    projectInfoTitle: 'Informazioni sul progetto',
    authorWordTitle: "Una parola dall'autore",
    infoMenuSubtitle: "Informazioni sul progetto e una nota dall'autore",
  },
  sw: {
    infoMenuTitle: 'Habari',
    projectInfoTitle: 'Maelezo ya mradi',
    authorWordTitle: 'Neno kutoka kwa mwandishi',
    infoMenuSubtitle: 'Maelezo ya mradi na noti kutoka kwa mwandishi',
  },
  ta: {
    infoMenuTitle: 'தகவல்',
    projectInfoTitle: 'திட்டத் தகவல்',
    authorWordTitle: 'ஆசிரியரின் வார்த்தை',
    infoMenuSubtitle: 'திட்டத் தகவல் மற்றும் ஆசிரியரின் குறிப்பு',
  },
  ha: {
    infoMenuTitle: 'Bayani',
    projectInfoTitle: 'Bayanin aiki',
    authorWordTitle: 'Kalma daga marubuci',
    infoMenuSubtitle: 'Bayanin aiki da rubutu daga marubuci',
  },
  th: {
    infoMenuTitle: 'ข้อมูล',
    projectInfoTitle: 'ข้อมูลโครงการ',
    authorWordTitle: 'คำจากผู้เขียน',
    infoMenuSubtitle: 'ข้อมูลโครงการและข้อความจากผู้เขียน',
  },
  tl: {
    infoMenuTitle: 'Impormasyon',
    projectInfoTitle: 'Impormasyon ng proyekto',
    authorWordTitle: 'Salita mula sa may-akda',
    infoMenuSubtitle: 'Impormasyon ng proyekto at tala mula sa may-akda',
  },
  nl: {
    infoMenuTitle: 'Informatie',
    projectInfoTitle: 'Projectinformatie',
    authorWordTitle: 'Een woord van de auteur',
    infoMenuSubtitle: 'Projectinformatie en een notitie van de auteur',
  },
  id: {
    infoMenuTitle: 'Informasi',
    projectInfoTitle: 'Info proyek',
    authorWordTitle: 'Kata dari penulis',
    infoMenuSubtitle: 'Info proyek dan catatan dari penulis',
  },
  sl: {
    infoMenuTitle: 'Informacije',
    projectInfoTitle: 'Informacije o projektu',
    authorWordTitle: 'Beseda avtorja',
    infoMenuSubtitle: 'Informacije o projektu in beseda avtorja',
  },
  so: {
    infoMenuTitle: 'Macluumaad',
    projectInfoTitle: 'Macluumaadka mashruuca',
    authorWordTitle: 'Eray ka yimid qoraaga',
    infoMenuSubtitle: 'Macluumaadka mashruuca iyo qoraal ka yimid qoraaga',
  },
  hi: {
    infoMenuTitle: 'जानकारी',
    projectInfoTitle: 'परियोजना की जानकारी',
    authorWordTitle: 'लेखक का शब्द',
    infoMenuSubtitle: 'परियोजना की जानकारी और लेखक का नोट',
  },
  ur: {
    infoMenuTitle: 'معلومات',
    projectInfoTitle: 'پروجیکٹ کی معلومات',
    authorWordTitle: 'مصنف کا لفظ',
    infoMenuSubtitle: 'پروجیکٹ کی معلومات اور مصنف کا نوٹ',
  },
  az: {
    infoMenuTitle: 'Məlumat',
    projectInfoTitle: 'Layihə məlumatı',
    authorWordTitle: 'Müəllifdən bir söz',
    infoMenuSubtitle: 'Layihə məlumatı və müəllifdən qeyd',
  },
  is: {
    infoMenuTitle: 'Upplýsingar',
    projectInfoTitle: 'Verkefnisupplýsingar',
    authorWordTitle: 'Orð frá höfundi',
    infoMenuSubtitle: 'Verkefnisupplýsingar og athugasemd frá höfundi',
  },
  ka: {
    infoMenuTitle: 'ინფორმაცია',
    projectInfoTitle: 'პროექტის ინფორმაცია',
    authorWordTitle: 'სიტყვა ავტორისგან',
    infoMenuSubtitle: 'პროექტის ინფორმაცია და შენიშვნა ავტორისგან',
  },
  ku: {
    infoMenuTitle: 'Agahî',
    projectInfoTitle: 'Agahiya proje',
    authorWordTitle: 'Peyvek ji nivîskar',
    infoMenuSubtitle: 'Agahiya proje û nîşanek ji nivîskar',
  },
};

type BodyModule = { PROJECT_INFO_BODY: string };
type AuthorModule = { AUTHOR_WORD_BODY: string };

const PROJECT_INFO_LOADERS: Record<AppLocale, () => Promise<BodyModule>> = {
  pl: () => import('./projectInfoBodies/pl.ts'),
  en: () => import('./projectInfoBodies/en.ts'),
  de: () => import('./projectInfoBodies/de.ts'),
  es: () => import('./projectInfoBodies/es.ts'),
  pt: () => import('./projectInfoBodies/pt.ts'),
  ru: () => import('./projectInfoBodies/ru.ts'),
  zh: () => import('./projectInfoBodies/zh.ts'),
  ja: () => import('./projectInfoBodies/ja.ts'),
  cs: () => import('./projectInfoBodies/cs.ts'),
  sq: () => import('./projectInfoBodies/sq.ts'),
  sr: () => import('./projectInfoBodies/sr.ts'),
  fa: () => import('./projectInfoBodies/fa.ts'),
  vi: () => import('./projectInfoBodies/vi.ts'),
  ms: () => import('./projectInfoBodies/ms.ts'),
  ar: () => import('./projectInfoBodies/ar.ts'),
  ro: () => import('./projectInfoBodies/ro.ts'),
  fr: () => import('./projectInfoBodies/fr.ts'),
  sv: () => import('./projectInfoBodies/sv.ts'),
  fi: () => import('./projectInfoBodies/fi.ts'),
  hu: () => import('./projectInfoBodies/hu.ts'),
  el: () => import('./projectInfoBodies/el.ts'),
  bg: () => import('./projectInfoBodies/bg.ts'),
  tr: () => import('./projectInfoBodies/tr.ts'),
  hr: () => import('./projectInfoBodies/hr.ts'),
  no: () => import('./projectInfoBodies/no.ts'),
  ko: () => import('./projectInfoBodies/ko.ts'),
  sk: () => import('./projectInfoBodies/sk.ts'),
  lt: () => import('./projectInfoBodies/lt.ts'),
  be: () => import('./projectInfoBodies/be.ts'),
  et: () => import('./projectInfoBodies/et.ts'),
  md: () => import('./projectInfoBodies/md.ts'),
  it: () => import('./projectInfoBodies/it.ts'),
  sw: () => import('./projectInfoBodies/sw.ts'),
  ta: () => import('./projectInfoBodies/ta.ts'),
  ha: () => import('./projectInfoBodies/ha.ts'),
  th: () => import('./projectInfoBodies/th.ts'),
  tl: () => import('./projectInfoBodies/tl.ts'),
  nl: () => import('./projectInfoBodies/nl.ts'),
  id: () => import('./projectInfoBodies/id.ts'),
  sl: () => import('./projectInfoBodies/sl.ts'),
  so: () => import('./projectInfoBodies/so.ts'),
  hi: () => import('./projectInfoBodies/hi.ts'),
  ur: () => import('./projectInfoBodies/ur.ts'),
  az: () => import('./projectInfoBodies/az.ts'),
  is: () => import('./projectInfoBodies/is.ts'),
  ka: () => import('./projectInfoBodies/ka.ts'),
  ku: () => import('./projectInfoBodies/ku.ts'),
};

const AUTHOR_WORD_LOADERS: Record<AppLocale, () => Promise<AuthorModule>> = {
  pl: () => import('./authorWordBodies/pl.ts'),
  en: () => import('./authorWordBodies/en.ts'),
  de: () => import('./authorWordBodies/de.ts'),
  es: () => import('./authorWordBodies/es.ts'),
  pt: () => import('./authorWordBodies/pt.ts'),
  ru: () => import('./authorWordBodies/ru.ts'),
  zh: () => import('./authorWordBodies/zh.ts'),
  ja: () => import('./authorWordBodies/ja.ts'),
  cs: () => import('./authorWordBodies/cs.ts'),
  sq: () => import('./authorWordBodies/sq.ts'),
  sr: () => import('./authorWordBodies/sr.ts'),
  fa: () => import('./authorWordBodies/fa.ts'),
  vi: () => import('./authorWordBodies/vi.ts'),
  ms: () => import('./authorWordBodies/ms.ts'),
  ar: () => import('./authorWordBodies/ar.ts'),
  ro: () => import('./authorWordBodies/ro.ts'),
  fr: () => import('./authorWordBodies/fr.ts'),
  sv: () => import('./authorWordBodies/sv.ts'),
  fi: () => import('./authorWordBodies/fi.ts'),
  hu: () => import('./authorWordBodies/hu.ts'),
  el: () => import('./authorWordBodies/el.ts'),
  bg: () => import('./authorWordBodies/bg.ts'),
  tr: () => import('./authorWordBodies/tr.ts'),
  hr: () => import('./authorWordBodies/hr.ts'),
  no: () => import('./authorWordBodies/no.ts'),
  ko: () => import('./authorWordBodies/ko.ts'),
  sk: () => import('./authorWordBodies/sk.ts'),
  lt: () => import('./authorWordBodies/lt.ts'),
  be: () => import('./authorWordBodies/be.ts'),
  et: () => import('./authorWordBodies/et.ts'),
  md: () => import('./authorWordBodies/md.ts'),
  it: () => import('./authorWordBodies/it.ts'),
  sw: () => import('./authorWordBodies/sw.ts'),
  ta: () => import('./authorWordBodies/ta.ts'),
  ha: () => import('./authorWordBodies/ha.ts'),
  th: () => import('./authorWordBodies/th.ts'),
  tl: () => import('./authorWordBodies/tl.ts'),
  nl: () => import('./authorWordBodies/nl.ts'),
  id: () => import('./authorWordBodies/id.ts'),
  sl: () => import('./authorWordBodies/sl.ts'),
  so: () => import('./authorWordBodies/so.ts'),
  hi: () => import('./authorWordBodies/hi.ts'),
  ur: () => import('./authorWordBodies/ur.ts'),
  az: () => import('./authorWordBodies/az.ts'),
  is: () => import('./authorWordBodies/is.ts'),
  ka: () => import('./authorWordBodies/ka.ts'),
  ku: () => import('./authorWordBodies/ku.ts'),
};

export async function loadProjectInfoBody(locale: AppLocale): Promise<string> {
  const loader = PROJECT_INFO_LOADERS[locale] ?? PROJECT_INFO_LOADERS.en;
  return (await loader()).PROJECT_INFO_BODY;
}

export async function loadAuthorWordBody(locale: AppLocale): Promise<string> {
  const loader = AUTHOR_WORD_LOADERS[locale] ?? AUTHOR_WORD_LOADERS.en;
  return (await loader()).AUTHOR_WORD_BODY;
}

export function getInfoLocaleUi(locale: AppLocale): InfoLocaleUi {
  return INFO_LOCALE_UI[locale] ?? INFO_LOCALE_UI.en;
}
