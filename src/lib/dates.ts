// Dates as the panel shows them, in Indonesian: "27 Nov 2026, 14:05" and "3 jam yang lalu".
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const formatDate = (value: string) => dayjs(value).locale("id").format("D MMM YYYY, HH:mm");
export const fromNow = (value: string) => dayjs(value).locale("id").fromNow();
