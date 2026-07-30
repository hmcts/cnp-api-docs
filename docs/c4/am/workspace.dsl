workspace {
    model {
        !include ../hmcts.mdsl
    }

    views {
        !include ../hmcts.vdsl

        systemContext am "am-context" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container am "am-overview" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }
    }
}
