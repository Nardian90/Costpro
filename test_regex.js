const tokenRegex = /(ref\(['"][^'"]+['"]\))|([A-Z][A-Z0-9_]*)|(\d+(?:\.\d+)?)|([\+\-\*\/\(\),])|(\s+)/gi;
const str = "VH(4.1.1)";
let match;
while ((match = tokenRegex.exec(str)) !== null) {
    console.log("Match:", match[0], "Index:", match.index, "Next Index:", tokenRegex.lastIndex);
}
