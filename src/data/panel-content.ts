export interface AxoSlide {
  src: string;
  caption: string;
  pdfUrl: string;
}

export interface CamPos {
  lat: number; lng: number; height: number; pitch: number; heading: number;
}

export interface ThumbItem {
  src: string;
  caption: string;
  camPos?: CamPos;
}

/** An outside source on the project (press, archive record, blog, social account), shown as a link list */
export interface SourceLink {
  kind: 'Archive' | 'Images' | 'Press' | 'Blog' | 'Social' | 'Reference';
  title: string;
  publisher: string;
  date?: string;      // as precise as known: '2021', '2021-08-05'
  url: string;
}

export interface PanelContent {
  period?: string;
  programme?: string;
  units?: string;
  description?: string;
  axos?: AxoSlide[];
  thumbs?: ThumbItem[];
  archiveTitle?: string;  // heading above the thumbs; defaults to 'Archive'
  sources?: SourceLink[]; // 'Other sources' list under the thumbs
}

export const PANEL_CONTENT: Record<number, PanelContent> = {
  37: {
    period: '1971–1980',
    programme: 'Structuralist co-housing',
    units: '> 201',
    description: `Groenhoven is a good example of a successful collective housing project. Its development began as part of the urban development of Amsterdam’s Bijlmer, based on modernist principles inspired by Le Corbusier. While the project was initially built to attract middle-class families, architect Van Stigt also sought to create a strong sense of community.

Although the Bijlmer later gained a negative reputation as a scattered and sometimes unsafe neighbourhood, Groenhoven residents have actively challenged this stigma by creating a safe and strongly communal environment. While the Bijlmer follows a predominantly horizontal honeycomb layout , Groenhoven responds to the outcomes of that model with a more ver tical design strategy combined with horizontal community spaces. Through this ver ticality the architect wanted to remove anonymity and cr eate c ollectivity.

And while Groenhoven does a good job of integrating this collectivity, it also raises the question of intersectionality among class, age and nationalities. While Groenhoven represents the potential of collective housing, it simultaneously challenges us to question for whom this sense of community is truly accessible.`,
    axos: [
      {
        src: '/images/37/axo-0.jpg',
        caption: '03.2526  Jitske Huisman, Sanne Krijnen, Zamir Narvaez, Ella Chi',
        pdfUrl: 'https://drive.google.com/file/d/1QxTc8vhMiV92PDVbRyPrAfyAAMwNU8QB/view',
      },
    ],
    thumbs: [
      { src: '/images/37/thumb-0.jpg', caption: '01.1  Nieuwe Instituut (n.d.)' },
      { src: '/images/37/thumb-1.jpg', caption: '01.2  Nieuwe Instituut (n.d.)' },
      { src: '/images/37/thumb-2.jpg', caption: '01.3  Amsterdam Beeldbank Archive (n.d.)' },
      { src: '/images/37/thumb-3.jpg', caption: '01.4  Amsterdam Beeldbank Archive (n.d.)' },
      { src: '/images/37/thumb-4.jpg', caption: '01.5  Amsterdam Beeldbank Archive (n.d.)' },
      { src: '/images/37/thumb-5.jpg', caption: '01.6  STIG7.9 High-rise. Studies/proposals for apartment floor plans. Isometric view. 1970-1971' },
      { src: '/images/37/thumb-6.jpg', caption: '01.7  STIG7.2 High-rise buildings. Sketches. Apartment floor plans, sections, facades, site plans, sun exposure studies. Roll 2 , 1970-1973' },
      { src: '/images/37/thumb-7.jpg', caption: '01.8  STIG7.13 High-rise. Pedestrian street perspectives. Design drawings/presentation drawings.' },
      { src: '/images/37/thumb-8.jpg', caption: '01.9  STIG7.13 High-rise. Pedestrian street perspectives. Design drawings/presentation drawings.', camPos: { lat: 52.325386, lng: 4.977244, height: 41.9, pitch: 12.8, heading: 286.7 } },
      { src: '/images/37/thumb-9.jpg', caption: '01.10  STIG7.12 High-rise buildings. Sites and axonometry. Design drawings/presentation drawings.' },
      { src: '/images/37/thumb-10.jpg', caption: '01.11  STIG7.12 High-rise buildings. Sites and axonometry. Design drawings/presentation drawings.' },
      { src: '/images/37/thumb-11.jpg', caption: '02.1  Amsterdam Beeldbank Archive (n.d.)', camPos: { lat: 52.328257, lng: 4.975334, height: 362.8, pitch: -45.1, heading: 191.8 } },
      { src: '/images/37/thumb-12.jpg', caption: '02.2  Amsterdam Beeldbank Archive (n.d.)', camPos: { lat: 52.331548, lng: 4.9956, height: 530.5, pitch: -18.9, heading: 248.4 } },
      { src: '/images/37/thumb-13.jpg', caption: '02.3  unknown' },
      { src: '/images/37/thumb-14.jpg', caption: '02.4  Nieuwe Instituut (n.d.)' },
      { src: '/images/37/thumb-15.jpg', caption: '02.5  unknown' },
    ],
    archiveTitle: 'National Archive',
    sources: [
      { kind: 'Archive',   title: 'Archief Joop van Stigt (STIG), inventory', publisher: 'Nieuwe Instituut', url: 'https://zoeken.nieuweinstituut.nl/images/archives/pdf/STIG.ead.pdf' },
      { kind: 'Archive',   title: 'Luchtfoto Bijlmer Oost', publisher: 'Stadsarchief Amsterdam', url: 'https://archief.amsterdam/beeldbank/detail/1ab2cb83-c558-081e-973b-f5f04cc5061c' },
      { kind: 'Images',    title: 'Complex Groenhoven', publisher: 'Buro Van Stigt', url: 'https://burovanstigt.nl/complex-groenhoven/' },
      { kind: 'Images',    title: 'Category: Groenhoven, Amsterdam', publisher: 'Wikimedia Commons', date: '2021', url: 'https://commons.wikimedia.org/wiki/Category:Groenhoven,_Amsterdam' },
      { kind: 'Press',     title: 'Amsterdamse architecten: Joop van Stigt', publisher: 'Ons Amsterdam', date: '2007-10-04', url: 'https://onsamsterdam.nl/artikelen/amsterdamse-architecten-joop-van-stigt' },
      { kind: 'Press',     title: 'Nieuw: Professor Joop van Stigtpark', publisher: '1104 en zo', date: '2013-12-07', url: 'https://1104enzo.nl/nieuw-professor-joop-van-stigtpark/' },
      { kind: 'Press',     title: 'Zuidoost wil flats Gouden Leeuw en Groenhoven tot monument maken', publisher: 'AT5', date: '2021', url: 'https://www.at5.nl/artikelen/205255/zuidoost-wil-flats-gouden-leeuw-en-groenhoven-tot-monument-maken' },
      { kind: 'Press',     title: 'Gouden Leeuw en Groenhoven gaan voor status van gemeentelijk monument', publisher: 'Bijlmer en Meer', date: '2021', url: 'http://www.bijlmerenmeer.nl/gouden-leeuw-en-groenhoven-gaan-voor-status-van-gemeentelijk-monument/' },
      { kind: 'Press',     title: 'Flats Gouden Leeuw en Groenhoven in Bijlmer zijn nu monumenten: "We zijn nu een beetje erkend"', publisher: 'AT5', date: '2021-08-05', url: 'https://www.at5.nl/artikelen/210349/flats-gouden-leeuw-en-groenhoven-in-bijlmer-zijn-nu-monumenten-we-zijn-nu-een-beetje-erkend' },
      { kind: 'Press',     title: 'Woontorens in de Bijlmer zijn monument geworden', publisher: 'Post65', date: '2021-08-25', url: 'https://post65.nl/woontorens-bijlmer-monument/' },
      { kind: 'Press',     title: 'Gouden Leeuw en Groenhoven monument', publisher: 'Monumentaal', date: '2021', url: 'https://monumentaal.com/gouden-leeuw-en-groenhoven-monument/' },
      { kind: 'Press',     title: 'Duurzame toekomst voor Groenhoven', publisher: 'Zuidoost en Meer', date: '2025-08-23', url: 'https://www.zuidoostenmeer.nl/masterplan-zuidoost/masterplan-zuidoost/16443/duurzame-toekomst-voor-groenhoven' },
      { kind: 'Press',     title: 'VvE Groenhoven 106-866, 8 torens in beweging', publisher: 'Energiesprong Alliantie', date: '2025-12-06', url: 'https://energiesprongalliantie.nl/project/vve-groenhoven-106-866-8-torens-in-beweging/' },
      { kind: 'Press',     title: 'Tour langs Gouden Leeuw en Groenhoven', publisher: 'Open Monumentendag', date: '2026', url: 'https://www.openmonumentendag.nl/monument/tour-langs-gouden-leeuw-en-groenhoven/' },
      { kind: 'Blog',      title: 'Eten in Groenhoven', publisher: '1104 en zo', date: '2012-09-17', url: 'https://1104enzo.nl/eten-in-groenhoven/' },
      { kind: 'Blog',      title: 'Gouden Leeuw, monumentaal!', publisher: 'Rob Alberts', date: '2021-07-29', url: 'https://robalberts.wordpress.com/2021/07/29/gouden-leeuw-monumentaal/' },
      { kind: 'Reference', title: 'Groenhoven (Amsterdam)', publisher: 'Wikipedia (NL)', url: 'https://nl.wikipedia.org/wiki/Groenhoven_(Amsterdam)' },
      { kind: 'Reference', title: 'De Gouden Leeuw en Groenhoven', publisher: 'Architectuur.org', url: 'https://www.architectuur.org/bouwwerk/985/De_Gouden_Leeuw_en_Groenhoven.html' },
    ],
  },
};
