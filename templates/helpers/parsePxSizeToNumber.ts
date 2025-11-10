// Convert px string to number
const parsePxSizeToNumber = (pxString: string) => {
  return Number.parseInt(pxString.replace("px", ""));
};
export { parsePxSizeToNumber };
