cmake_minimum_required(VERSION 3.10)
project(casc-extract C)

if (NOT EXISTS "${CMAKE_SOURCE_DIR}/CascLib/CMakeLists.txt")
    message(FATAL_ERROR
        "Missing CascLib. Run:\n"
        "  git clone https://github.com/ladislav-zezula/CascLib.git\n"
        "inside this directory.")
endif()

add_subdirectory(CascLib)
include_directories(CascLib/src)

add_executable(casc-extract main.c)
target_link_libraries(casc-extract casc)
