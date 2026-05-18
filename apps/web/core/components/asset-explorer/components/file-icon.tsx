import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder as FolderIcon,
  Presentation,
} from "lucide-react";

type TFileTone = {
  Icon: typeof FileIcon;
  fg: string;
};

const TONE_BY_EXT: Record<string, TFileTone> = {
  pdf: { Icon: FileType, fg: "text-rose-500" },
  doc: { Icon: FileText, fg: "text-sky-500" },
  docx: { Icon: FileText, fg: "text-sky-500" },
  rtf: { Icon: FileText, fg: "text-sky-500" },
  odt: { Icon: FileText, fg: "text-sky-500" },
  txt: { Icon: FileText, fg: "text-slate-500" },
  md: { Icon: FileText, fg: "text-slate-500" },

  xls: { Icon: FileSpreadsheet, fg: "text-emerald-500" },
  xlsx: { Icon: FileSpreadsheet, fg: "text-emerald-500" },
  csv: { Icon: FileSpreadsheet, fg: "text-emerald-500" },
  ods: { Icon: FileSpreadsheet, fg: "text-emerald-500" },

  ppt: { Icon: Presentation, fg: "text-amber-500" },
  pptx: { Icon: Presentation, fg: "text-amber-500" },
  odp: { Icon: Presentation, fg: "text-amber-500" },

  png: { Icon: FileImage, fg: "text-fuchsia-500" },
  jpg: { Icon: FileImage, fg: "text-fuchsia-500" },
  jpeg: { Icon: FileImage, fg: "text-fuchsia-500" },
  gif: { Icon: FileImage, fg: "text-fuchsia-500" },
  webp: { Icon: FileImage, fg: "text-fuchsia-500" },
  svg: { Icon: FileImage, fg: "text-fuchsia-500" },
  bmp: { Icon: FileImage, fg: "text-fuchsia-500" },

  mp4: { Icon: FileVideo, fg: "text-violet-500" },
  mov: { Icon: FileVideo, fg: "text-violet-500" },
  webm: { Icon: FileVideo, fg: "text-violet-500" },
  mkv: { Icon: FileVideo, fg: "text-violet-500" },
  avi: { Icon: FileVideo, fg: "text-violet-500" },

  mp3: { Icon: FileAudio, fg: "text-indigo-500" },
  wav: { Icon: FileAudio, fg: "text-indigo-500" },
  flac: { Icon: FileAudio, fg: "text-indigo-500" },
  m4a: { Icon: FileAudio, fg: "text-indigo-500" },
  ogg: { Icon: FileAudio, fg: "text-indigo-500" },

  zip: { Icon: FileArchive, fg: "text-yellow-600" },
  rar: { Icon: FileArchive, fg: "text-yellow-600" },
  "7z": { Icon: FileArchive, fg: "text-yellow-600" },
  tar: { Icon: FileArchive, fg: "text-yellow-600" },
  gz: { Icon: FileArchive, fg: "text-yellow-600" },

  js: { Icon: FileCode, fg: "text-yellow-500" },
  ts: { Icon: FileCode, fg: "text-sky-500" },
  tsx: { Icon: FileCode, fg: "text-sky-500" },
  jsx: { Icon: FileCode, fg: "text-yellow-500" },
  py: { Icon: FileCode, fg: "text-cyan-600" },
  java: { Icon: FileCode, fg: "text-orange-600" },
  go: { Icon: FileCode, fg: "text-cyan-500" },
  rs: { Icon: FileCode, fg: "text-orange-700" },
  json: { Icon: FileCode, fg: "text-zinc-500" },
  html: { Icon: FileCode, fg: "text-orange-500" },
  css: { Icon: FileCode, fg: "text-blue-500" },
};

const DEFAULT_FILE_TONE: TFileTone = {
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
  sm: { wrap: "h-7 w-7 rounded-md", icon: "size-3.5" },
  md: { wrap: "h-9 w-9 rounded-lg", icon: "size-[18px]" },
  lg: { wrap: "h-12 w-12 rounded-xl", icon: "size-6" },
} as const;

export const FileTypeIcon = ({ filename, size = "md", className = "" }: TFileTypeIconProps) => {
  const tone = TONE_BY_EXT[getExt(filename)] ?? DEFAULT_FILE_TONE;
  const { Icon, fg } = tone;
  const { wrap, icon } = SIZE_MAP[size];
  return (
    <div className={`flex shrink-0 items-center justify-center ${wrap} ${className}`}>
      <Icon className={`${icon} ${fg}`} strokeWidth={1.75} />
    </div>
  );
};

export const FolderTypeIcon = ({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) => {
  const { wrap, icon } = SIZE_MAP[size];
  return (
    <div className={`flex shrink-0 items-center justify-center ${wrap} ${className}`}>
      <FolderIcon className={`${icon} fill-current text-accent-primary`} strokeWidth={1.5} />
    </div>
  );
};

export const getFileExt = getExt;
