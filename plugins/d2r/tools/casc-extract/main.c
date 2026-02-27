#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "CascLib.h"

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <casc_root> <file_path> [output_path]\n", argv[0]);
        return 1;
    }

    const char *cascRoot = argv[1];
    const char *filePath = argv[2];
    const char *outPath = argc > 3 ? argv[3] : NULL;

    HANDLE hStorage = NULL;
    if (!CascOpenStorage(cascRoot, 0, &hStorage)) {
        fprintf(stderr, "Failed to open CASC storage: error %d\n", GetCascError());
        
        // Try listing what we can find
        CASC_FIND_DATA findData;
        HANDLE hFind = CascFindFirstFile(hStorage, "*", &findData, NULL);
        if (hFind) {
            int count = 0;
            do {
                if (count < 20) printf("  %s\n", findData.szFileName);
                count++;
            } while (CascFindNextFile(hFind, &findData));
            CascFindClose(hFind);
            printf("... total %d files\n", count);
        }
        return 1;
    }
    
    printf("CASC storage opened successfully\n");

    // Try to open the file
    HANDLE hFile = NULL;
    if (!CascOpenFile(hStorage, filePath, 0, CASC_OPEN_BY_NAME, &hFile)) {
        fprintf(stderr, "Failed to open file '%s': error %d\n", filePath, GetCascError());
        
        // List files matching a pattern
        printf("Listing files:\n");
        CASC_FIND_DATA findData;
        HANDLE hFind = CascFindFirstFile(hStorage, "*", &findData, NULL);
        if (hFind) {
            int count = 0;
            do {
                if (strstr(findData.szFileName, "StatCost") || 
                    strstr(findData.szFileName, "statcost") ||
                    strstr(findData.szFileName, "excel")) {
                    printf("  %s (%llu bytes)\n", findData.szFileName, 
                           (unsigned long long)findData.FileSize);
                }
                count++;
            } while (CascFindNextFile(hFind, &findData));
            CascFindClose(hFind);
            printf("Total files in storage: %d\n", count);
        }
        CascCloseStorage(hStorage);
        return 1;
    }

    // Read and output
    DWORD fileSize = CascGetFileSize(hFile, NULL);
    printf("File size: %u bytes\n", fileSize);
    
    char *buf = malloc(fileSize + 1);
    DWORD bytesRead;
    CascReadFile(hFile, buf, fileSize, &bytesRead);
    buf[bytesRead] = 0;

    if (outPath) {
        FILE *fp = fopen(outPath, "wb");
        fwrite(buf, 1, bytesRead, fp);
        fclose(fp);
        printf("Written to %s\n", outPath);
    } else {
        fwrite(buf, 1, bytesRead, stdout);
    }

    free(buf);
    CascCloseFile(hFile);
    CascCloseStorage(hStorage);
    return 0;
}
