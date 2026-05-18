import {
  File as FileIcon,
  FileAudio,
  FileCode,
  FileImage,
  FileVideo,
  Folder as FolderIcon,
} from "lucide-react";

type TIconComponent = React.FC<{ className?: string }>;

const WordColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
    <path
      fill="#283c82"
      d="M18.536,2.323V4.868c3.4.019,7.12-.035,10.521.019a.783.783,0,0,1,.912.861c.054,6.266-.013,12.89.032,19.157-.02.4.009,1.118-.053,1.517-.079.509-.306.607-.817.676-.286.039-.764.034-1.045.047-2.792-.014-5.582-.011-8.374-.01l-1.175,0v2.547L2,27.133Q2,16,2,4.873L18.536,2.322"
    />
    <path
      fill="#fff"
      d="M18.536,5.822h10.5V26.18h-10.5V23.635h8.27V22.363h-8.27v-1.59h8.27V19.5h-8.27v-1.59h8.27V16.637h-8.27v-1.59h8.27V13.774h-8.27v-1.59h8.27V10.911h-8.27V9.321h8.27V8.048h-8.27V5.822"
    />
    <path
      fill="#fff"
      d="M8.573,11.443c.6-.035,1.209-.06,1.813-.092.423,2.147.856,4.291,1.314,6.429.359-2.208.757-4.409,1.142-6.613.636-.022,1.272-.057,1.905-.1-.719,3.082-1.349,6.19-2.134,9.254-.531.277-1.326-.013-1.956.032-.423-2.106-.916-4.2-1.295-6.314C8.99,16.1,8.506,18.133,8.08,20.175q-.916-.048-1.839-.111c-.528-2.8-1.148-5.579-1.641-8.385.544-.025,1.091-.048,1.635-.067.328,2.026.7,4.043.986,6.072.448-2.08.907-4.161,1.352-6.241"
    />
  </svg>
);

const ExcelColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
    <path
      fill="#20744a"
      fillRule="evenodd"
      d="M28.781,4.405H18.651V2.018L2,4.588V27.115l16.651,2.868V26.445H28.781A1.162,1.162,0,0,0,30,25.349V5.5A1.162,1.162,0,0,0,28.781,4.405Zm.16,21.126H18.617L18.6,23.642h2.487v-2.2H18.581l-.012-1.3h2.518v-2.2H18.55l-.012-1.3h2.549v-2.2H18.53v-1.3h2.557v-2.2H18.53v-1.3h2.557v-2.2H18.53v-2H28.941Z"
    />
    <rect x="22.487" y="7.439" width="4.323" height="2.2" fill="#20744a" />
    <rect x="22.487" y="10.94" width="4.323" height="2.2" fill="#20744a" />
    <rect x="22.487" y="14.441" width="4.323" height="2.2" fill="#20744a" />
    <rect x="22.487" y="17.942" width="4.323" height="2.2" fill="#20744a" />
    <rect x="22.487" y="21.443" width="4.323" height="2.2" fill="#20744a" />
    <polygon
      fill="#ffffff"
      fillRule="evenodd"
      points="6.347 10.673 8.493 10.55 9.842 14.259 11.436 10.397 13.582 10.274 10.976 15.54 13.582 20.819 11.313 20.666 9.781 16.642 8.248 20.513 6.163 20.329 8.585 15.666 6.347 10.673"
    />
  </svg>
);

const PowerPointColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
    <path
      fill="#d33922"
      d="M18.536,2.321V5.184c3.4.019,7.357-.035,10.754.016.642,0,.67.568.678,1.064.054,5.942-.013,12.055.032,18-.012.234-.006,1.1-.013,1.346-.022.823-.434.859-1.257.884-.132,0-.52.006-.648.012-3.181-.016-6.362-.009-9.546-.009v3.182L2,27.134Q2,16,2,4.873L18.536,2.322"
    />
    <path
      fill="#fff"
      d="M18.536,6.138h10.5v19.4h-10.5V23H26.17V21.725H18.536V20.135H26.17V18.863H18.539c0-.624,0-1.247-.006-1.87a4.467,4.467,0,0,0,3.82-.375,4.352,4.352,0,0,0,1.959-3.474c-1.4-.01-2.793-.006-4.186-.006,0-1.384.016-2.767-.029-4.148-.522.1-1.043.21-1.562.321V6.139"
    />
    <path
      fill="#d33922"
      d="M20.766,8.324a4.476,4.476,0,0,1,4.186,4.167c-1.4.016-2.793.01-4.189.01,0-1.393,0-2.787,0-4.177"
    />
    <path
      fill="#fff"
      d="M7.1,10.726c1.727.083,3.82-.684,5.252.611,1.371,1.664,1.008,4.724-1.024,5.719A4.7,4.7,0,0,1,9,17.348c0,1.244-.006,2.488,0,3.731-.63-.054-1.263-.108-1.893-.159-.029-3.4-.035-6.8,0-10.2"
    />
    <path
      fill="#d33922"
      d="M8.993,12.446c.627-.029,1.4-.143,1.826.445a2.308,2.308,0,0,1,.041,2.087c-.363.655-1.183.592-1.816.668-.067-1.066-.06-2.131-.051-3.2"
    />
  </svg>
);

const TxtColorIcon: TIconComponent = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 548.291 548.291"
    className={className}
  >
    <path
      fill="#5b6577"
      d="M486.201,196.124h-13.166V132.59c0-0.396-0.062-0.795-0.115-1.196c-0.021-2.523-0.825-5-2.552-6.963L364.657,3.677c-0.033-0.031-0.064-0.042-0.085-0.075c-0.63-0.704-1.364-1.29-2.143-1.796c-0.229-0.154-0.461-0.283-0.702-0.418c-0.672-0.366-1.387-0.671-2.121-0.892c-0.2-0.055-0.379-0.134-0.577-0.188C358.23,0.118,357.401,0,356.562,0H96.757C84.894,0,75.256,9.649,75.256,21.502v174.616H62.09c-16.968,0-30.729,13.753-30.729,30.73v159.812c0,16.961,13.761,30.731,30.729,30.731h13.166V526.79c0,11.854,9.638,21.501,21.501,21.501h354.776c11.853,0,21.501-9.647,21.501-21.501V417.392h13.166c16.966,0,30.729-13.764,30.729-30.731V226.854C516.93,209.872,503.167,196.124,486.201,196.124z M96.757,21.502h249.054v110.006c0,5.943,4.817,10.751,10.751,10.751h94.972v53.864H96.757V21.502z M202.814,225.042h41.68l14.063,29.3c4.756,9.756,8.336,17.622,12.147,26.676h0.48c3.798-10.242,6.9-17.392,10.95-26.676l13.587-29.3h41.449l-45.261,78.363l47.638,82.185h-41.927l-14.525-29.06c-5.956-11.197-9.771-19.528-14.299-28.825h-0.478c-3.334,9.297-7.381,17.628-12.381,28.825l-13.336,29.06h-41.455l46.455-81.224L202.814,225.042z M66.08,255.532v-30.489h123.382v30.489h-43.828v130.049h-36.434V255.532H66.08z M451.534,520.962H96.757v-103.57h354.776V520.962z M471.764,255.532h-43.831v130.049h-36.442V255.532h-43.119v-30.489h123.393V255.532z"
    />
  </svg>
);

const ImageColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" className={className}>
    <path
      fill="#6EBAFF"
      stroke="#6EBAFF"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeMiterlimit={10}
      d="M24,26H6c-2.2,0-4-1.8-4-4V8c0-2.2,1.8-4,4-4h18c2.2,0,4,1.8,4,4v14C28,24.2,26.2,26,24,26z"
    />
    <path
      fill="#5189E5"
      stroke="#5189E5"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeMiterlimit={10}
      d="M6,26h18c2.2,0,4-1.8,4-4v-7l-4-4l-10.4,9.6L9,16l-7,6.4C2.3,24.4,3.9,26,6,26z"
    />
    <circle
      cx="7"
      cy="10"
      r="2"
      fill="#E3FAFF"
      stroke="#E3FAFF"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeMiterlimit={10}
    />
  </svg>
);

const PdfColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" className={className}>
    <path fill="#ff402f" d="M325,105H250a5,5,0,0,1-5-5V25a5,5,0,0,1,10,0V95h70a5,5,0,0,1,0,10Z" />
    <path
      fill="#ff402f"
      d="M325,154.83a5,5,0,0,1-5-5V102.07L247.93,30H100A20,20,0,0,0,80,50v98.17a5,5,0,0,1-10,0V50a30,30,0,0,1,30-30H250a5,5,0,0,1,3.54,1.46l75,75A5,5,0,0,1,330,100v49.83A5,5,0,0,1,325,154.83Z"
    />
    <path
      fill="#ff402f"
      d="M300,380H100a30,30,0,0,1-30-30V275a5,5,0,0,1,10,0v75a20,20,0,0,0,20,20H300a20,20,0,0,0,20-20V275a5,5,0,0,1,10,0v75A30,30,0,0,1,300,380Z"
    />
    <path fill="#ff402f" d="M275,280H125a5,5,0,0,1,0-10H275a5,5,0,0,1,0,10Z" />
    <path fill="#ff402f" d="M200,330H125a5,5,0,0,1,0-10h75a5,5,0,0,1,0,10Z" />
    <path
      fill="#ff402f"
      d="M325,280H75a30,30,0,0,1-30-30V173.17a30,30,0,0,1,30-30h.2l250,1.66a30.09,30.09,0,0,1,29.81,30V250A30,30,0,0,1,325,280ZM75,153.17a20,20,0,0,0-20,20V250a20,20,0,0,0,20,20H325a20,20,0,0,0,20-20V174.83a20.06,20.06,0,0,0-19.88-20l-250-1.66Z"
    />
    <path
      fill="#ff402f"
      d="M145,236h-9.61V182.68h21.84q9.34,0,13.85,4.71a16.37,16.37,0,0,1-.37,22.95,17.49,17.49,0,0,1-12.38,4.53H145Zm0-29.37h11.37q4.45,0,6.8-2.19a7.58,7.58,0,0,0,2.34-5.82,8,8,0,0,0-2.17-5.62q-2.17-2.34-7.83-2.34H145Z"
    />
    <path
      fill="#ff402f"
      d="M183,236V182.68H202.7q10.9,0,17.5,7.71t6.6,19q0,11.33-6.8,18.95T200.55,236Zm9.88-7.85h8a14.36,14.36,0,0,0,10.94-4.84q4.49-4.84,4.49-14.41a21.91,21.91,0,0,0-3.93-13.22,12.22,12.22,0,0,0-10.37-5.41h-9.14Z"
    />
    <path fill="#ff402f" d="M245.59,236H235.7V182.68h33.71v8.24H245.59v14.57h18.75v8H245.59Z" />
  </svg>
);

const ArchiveColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" className={className}>
    <path fill="#F95F5D" d="M96 144h832v720H96z" />
    <path
      fill="#55C7F7"
      d="M923.2 352H100.8C62.4 352 32 321.6 32 283.2V132.8C32 94.4 62.4 64 100.8 64h824C961.6 64 992 94.4 992 132.8v152c0 36.8-30.4 67.2-68.8 67.2z"
    />
    <path
      fill="#F95F5D"
      d="M923.2 672H100.8C62.4 672 32 641.6 32 603.2V420.8C32 382.4 62.4 352 100.8 352h824c38.4 0 68.8 30.4 68.8 68.8v184c-1.6 36.8-32 67.2-70.4 67.2z"
    />
    <path
      fill="#7ECF3B"
      d="M923.2 960H100.8C62.4 960 32 929.6 32 891.2v-152C32 702.4 62.4 672 100.8 672h824c38.4 0 68.8 30.4 68.8 68.8v152c-1.6 36.8-32 67.2-70.4 67.2z"
    />
    <path fill="#FDAF42" d="M624 32v960H400V32z" />
    <path
      fill="#FFFFFF"
      d="M632 616h-240c-22.4 0-40-17.6-40-40v-128c0-22.4 17.6-40 40-40h240c22.4 0 40 17.6 40 40v128c0 22.4-17.6 40-40 40z m-232-48h224v-112H400v112z"
    />
  </svg>
);

const XmindColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" className={className}>
    <path
      fill="#FE2139"
      d="M874.666667 938.666667H149.333333c-36.266667 0-64-27.733333-64-64V149.333333c0-36.266667 27.733333-64 64-64h725.333334c36.266667 0 64 27.733333 64 64v725.333334c0 36.266667-27.733333 64-64 64z"
    />
    <path
      fill="#F2F2F2"
      d="M753.066667 375.466667c0-36.266667-8.533333-44.8-44.8-40.533334-21.333333 2.133333-44.8 6.4-66.133334 10.666667-14.933333 2.133333-29.866667 6.4-44.8 8.533333-19.2 4.266667-23.466667 10.666667-17.066666 27.733334 2.133333 6.4 4.266667 12.8 4.266666 19.2 2.133333 19.2-2.133333 27.733333-17.066666 38.4-34.133333 19.2-76.8 17.066667-108.8-8.533334-25.6-19.2-40.533333-46.933333-53.333334-74.666666-12.8-29.866667-17.066667-32-49.066666-25.6-38.4 6.4-78.933333 12.8-117.333334 19.2-23.466667 4.266667-34.133333 19.2-25.6 42.666666 10.666667 32 32 55.466667 61.866667 70.4 29.866667 17.066667 61.866667 27.733333 93.866667 42.666667 8.533333 4.266667 14.933333 10.666667 23.466666 17.066667-8.533333 6.4-14.933333 12.8-23.466666 14.933333-34.133333 10.666667-68.266667 25.6-98.133334 46.933333-29.866667 21.333333-49.066667 51.2-49.066666 89.6 0 21.333333 4.266667 23.466667 25.6 21.333334 38.4-6.4 74.666667-12.8 113.066666-19.2 19.2-4.266667 25.6-10.666667 27.733334-29.866667v-12.8c6.4-38.4 27.733333-66.133333 66.133333-70.4 78.933333-10.666667 147.2 29.866667 172.8 106.666667 6.4 21.333333 19.2 27.733333 42.666667 23.466666 46.933333-10.666667 91.733333-19.2 138.666666-29.866666 8.533333-2.133333 10.666667-6.4 10.666667-14.933334 0-25.6-10.666667-44.8-25.6-64-29.866667-38.4-70.4-59.733333-113.066667-78.933333-12.8-6.4-27.733333-10.666667-40.533333-19.2-8.533333-4.266667-6.4-10.666667 2.133333-12.8 10.666667-4.266667 23.466667-6.4 36.266667-8.533333 42.666667-10.666667 76.8-42.666667 74.666667-89.6z"
    />
  </svg>
);

const MarkdownColorIcon: TIconComponent = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" className={className}>
    <path
      fill="#D39E0A"
      d="M87.991463 806.033866v53.68678c0 43.593081 17.554261 85.28445 48.859359 116.150691A168.082046 168.082046 0 0 0 254.756939 1023.999269h520.044971c44.251365 0 86.747305-17.334832 117.906118-48.127932 31.378241-30.866242 48.859359-72.557611 48.859358-116.150691v-53.028496l-853.575923-0.585142z"
    />
    <path
      fill="#D39E0A"
      d="M941.859957 823.14927V343.186527a64.365622 64.365622 0 0 0-18.651402-44.690222L643.144956 18.28642A63.049053 63.049053 0 0 0 598.381591 0.000731H254.683796A166.911762 166.911762 0 0 0 87.772035 166.912493v656.236777"
    />
    <path
      fill="#FFFFFF"
      d="M403.748726 559.762217l74.532465 160.036343a19.529115 19.529115 0 0 0 7.387418 8.265131 20.918827 20.918827 0 0 0 10.971413 3.145139h30.354242c8.045703 0 15.286835-4.534851 18.505117-11.483412l74.532465-160.402057v189.439729a19.748543 19.748543 0 0 0 20.187399 19.236544h34.450237a19.748543 19.748543 0 0 0 20.1874-19.236544V421.522415a19.748543 19.748543 0 0 0-20.1874-19.236544h-43.812509a20.918827 20.918827 0 0 0-11.044556 3.145138 19.529115 19.529115 0 0 0-7.46056 8.411417l-100.205571 219.647686-100.205572-219.647686a19.529115 19.529115 0 0 0-7.46056-8.411417 20.918827 20.918827 0 0 0-11.044556-3.145138h-44.10508a19.748543 19.748543 0 0 0-20.1874 19.236544v327.240675a19.748543 19.748543 0 0 0 20.1874 19.236544h34.230808a19.748543 19.748543 0 0 0 20.1874-19.236544V559.762217z"
    />
    <path
      fill="#A87E09"
      d="M920.94113 297.252878L641.023816 17.116136a62.17134 62.17134 0 0 0-32.475382-16.822834 6.582848 6.582848 0 0 0-4.973708 1.31657 6.290277 6.290277 0 0 0-2.194282 4.754279v135.314092a195.144864 195.144864 0 0 0 195.510578 194.998579h135.314092c1.901712 0 3.657138-0.731428 4.827422-2.12114a6.802276 6.802276 0 0 0 1.60914-4.973707 62.537054 62.537054 0 0 0-17.700546-32.329097z"
    />
    <path
      fill="#F2B919"
      d="M803.254441 305.591152h124.635251a55.661635 55.661635 0 0 0-6.875419-8.411417L640.950673 17.116136A54.564493 54.564493 0 0 0 632.539256 10.240717v124.708393a170.715185 170.715185 0 0 0 170.715185 170.642042z"
    />
  </svg>
);

type TFileTone =
  | { kind: "color"; ColorIcon: TIconComponent }
  | { kind: "mono"; Icon: typeof FileIcon; fg: string };

const TONE_BY_EXT: Record<string, TFileTone> = {
  doc: { kind: "color", ColorIcon: WordColorIcon },
  docx: { kind: "color", ColorIcon: WordColorIcon },
  rtf: { kind: "color", ColorIcon: WordColorIcon },
  odt: { kind: "color", ColorIcon: WordColorIcon },

  xls: { kind: "color", ColorIcon: ExcelColorIcon },
  xlsx: { kind: "color", ColorIcon: ExcelColorIcon },
  csv: { kind: "color", ColorIcon: ExcelColorIcon },
  ods: { kind: "color", ColorIcon: ExcelColorIcon },

  ppt: { kind: "color", ColorIcon: PowerPointColorIcon },
  pptx: { kind: "color", ColorIcon: PowerPointColorIcon },
  odp: { kind: "color", ColorIcon: PowerPointColorIcon },

  txt: { kind: "color", ColorIcon: TxtColorIcon },
  log: { kind: "color", ColorIcon: TxtColorIcon },

  md: { kind: "color", ColorIcon: MarkdownColorIcon },
  markdown: { kind: "color", ColorIcon: MarkdownColorIcon },
  mdx: { kind: "color", ColorIcon: MarkdownColorIcon },

  xmind: { kind: "color", ColorIcon: XmindColorIcon },

  pdf: { kind: "color", ColorIcon: PdfColorIcon },

  png: { kind: "color", ColorIcon: ImageColorIcon },
  jpg: { kind: "color", ColorIcon: ImageColorIcon },
  jpeg: { kind: "color", ColorIcon: ImageColorIcon },
  gif: { kind: "color", ColorIcon: ImageColorIcon },
  webp: { kind: "color", ColorIcon: ImageColorIcon },
  bmp: { kind: "color", ColorIcon: ImageColorIcon },
  tif: { kind: "color", ColorIcon: ImageColorIcon },
  tiff: { kind: "color", ColorIcon: ImageColorIcon },
  svg: { kind: "mono", Icon: FileImage, fg: "text-fuchsia-500" },

  mp4: { kind: "mono", Icon: FileVideo, fg: "text-violet-500" },
  mov: { kind: "mono", Icon: FileVideo, fg: "text-violet-500" },
  webm: { kind: "mono", Icon: FileVideo, fg: "text-violet-500" },
  mkv: { kind: "mono", Icon: FileVideo, fg: "text-violet-500" },
  avi: { kind: "mono", Icon: FileVideo, fg: "text-violet-500" },

  mp3: { kind: "mono", Icon: FileAudio, fg: "text-indigo-500" },
  wav: { kind: "mono", Icon: FileAudio, fg: "text-indigo-500" },
  flac: { kind: "mono", Icon: FileAudio, fg: "text-indigo-500" },
  m4a: { kind: "mono", Icon: FileAudio, fg: "text-indigo-500" },
  ogg: { kind: "mono", Icon: FileAudio, fg: "text-indigo-500" },

  zip: { kind: "color", ColorIcon: ArchiveColorIcon },
  rar: { kind: "color", ColorIcon: ArchiveColorIcon },
  "7z": { kind: "color", ColorIcon: ArchiveColorIcon },
  tar: { kind: "color", ColorIcon: ArchiveColorIcon },
  gz: { kind: "color", ColorIcon: ArchiveColorIcon },
  bz2: { kind: "color", ColorIcon: ArchiveColorIcon },
  xz: { kind: "color", ColorIcon: ArchiveColorIcon },

  js: { kind: "mono", Icon: FileCode, fg: "text-yellow-500" },
  ts: { kind: "mono", Icon: FileCode, fg: "text-sky-500" },
  tsx: { kind: "mono", Icon: FileCode, fg: "text-sky-500" },
  jsx: { kind: "mono", Icon: FileCode, fg: "text-yellow-500" },
  py: { kind: "mono", Icon: FileCode, fg: "text-cyan-600" },
  java: { kind: "mono", Icon: FileCode, fg: "text-orange-600" },
  go: { kind: "mono", Icon: FileCode, fg: "text-cyan-500" },
  rs: { kind: "mono", Icon: FileCode, fg: "text-orange-700" },
  json: { kind: "mono", Icon: FileCode, fg: "text-zinc-500" },
  html: { kind: "mono", Icon: FileCode, fg: "text-orange-500" },
  css: { kind: "mono", Icon: FileCode, fg: "text-blue-500" },
};

const DEFAULT_FILE_TONE: TFileTone = {
  kind: "mono",
  Icon: FileIcon,
  fg: "text-zinc-500",
};

const getExt = (filename?: string): string => {
  const parts = String(filename ?? "").split(".");
  if (parts.length <= 1) return "";
  return parts.pop()!.toLowerCase();
};

type TFileTypeIconProps = {
  filename?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_MAP = {
  sm: { wrap: "h-7 w-7 rounded-md", monoIcon: "size-[18px]", colorIcon: "size-5" },
  md: { wrap: "h-9 w-9 rounded-lg", monoIcon: "size-6", colorIcon: "size-[26px]" },
  lg: { wrap: "h-12 w-12 rounded-xl", monoIcon: "size-8", colorIcon: "size-9" },
} as const;

export const FileTypeIcon = ({ filename, size = "md", className = "" }: TFileTypeIconProps) => {
  const tone = TONE_BY_EXT[getExt(filename)] ?? DEFAULT_FILE_TONE;
  const { wrap, monoIcon, colorIcon } = SIZE_MAP[size];
  return (
    <div className={`flex shrink-0 items-center justify-center ${wrap} ${className}`}>
      {tone.kind === "color" ? (
        <tone.ColorIcon className={colorIcon} />
      ) : (
        <tone.Icon className={`${monoIcon} ${tone.fg}`} strokeWidth={1.75} />
      )}
    </div>
  );
};

export const FolderTypeIcon = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) => {
  const { wrap, monoIcon } = SIZE_MAP[size];
  return (
    <div className={`flex shrink-0 items-center justify-center ${wrap} ${className}`}>
      <FolderIcon className={monoIcon} color="#ca8a04" fill="#fcd34d" strokeWidth={1.5} />
    </div>
  );
};

export const getFileExt = getExt;
